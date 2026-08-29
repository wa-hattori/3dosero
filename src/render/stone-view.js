import * as THREE from 'three';
import { BOARD_SIZE, EMPTY, BLACK, WHITE, indexOf } from '../logic/board.js';
import { CELL_SIZE, logicToWorld } from './board-layout.js';

const STONE_RADIUS = CELL_SIZE * 0.35;
const STONE_SEGMENTS = 16;

const BLACK_STONE_COLOR = 0x1a1a1a;
const WHITE_STONE_COLOR = 0xf2f2f2;

/** 新しく置かれた/反転した石が等倍サイズに拡大するまでの時間（秒）。 */
const POP_DURATION_SECONDS = 0.35;
/** ポップ演出の開始スケール（0に近いほど小さい状態から始まる）。 */
const POP_START_SCALE = 0.2;

const dummy = new THREE.Object3D();

const createStoneMesh = (scene, color, maxStones) => {
  const geometry = new THREE.SphereGeometry(STONE_RADIUS, STONE_SEGMENTS, STONE_SEGMENTS);
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.InstancedMesh(geometry, material, maxStones);
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
};

/** 0→1の経過率をイーズアウトする（勢いよく飛び出して収まる見た目にする）。 */
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/**
 * `BLACK`/`WHITE` それぞれの石を1つの`InstancedMesh`で描画する。
 * 石1個ごとにメッシュを新規生成せず、色ごとに共有ジオメトリ/マテリアルを使い回す
 * （[three-js-conventions](../../.claude/rules/javascript/three-js-conventions.md)）。
 * 新しく置かれた/反転した石は `tick()` 経由で短くポップ演出される。
 * @param {import('three').Scene} scene - 追加先のシーン
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {{
 *   update: (board: Int8Array, activeLayer?: number | null) => void,
 *   tick: () => void,
 *   dispose: () => void,
 * }}
 */
export const createStoneView = (scene, boardSize = BOARD_SIZE) => {
  const maxStonesPerColor = boardSize * boardSize * boardSize;
  const blackMesh = createStoneMesh(scene, BLACK_STONE_COLOR, maxStonesPerColor);
  const whiteMesh = createStoneMesh(scene, WHITE_STONE_COLOR, maxStonesPerColor);
  const meshByColor = { [BLACK]: blackMesh, [WHITE]: whiteMesh };

  /** 直前の`update()`時点の盤面（差分検出用）。初回は`null`（初期配置はポップ演出しない）。 */
  let previousBoard = null;
  /** ポップ演出中の石一覧: `{ mesh, instanceIndex, x, y, z, startTime }`。 */
  let poppingStones = [];

  const setInstanceTransform = (mesh, instanceIndex, x, y, z, scale) => {
    const world = logicToWorld(x, y, z, boardSize);
    dummy.position.set(world.x, world.y, world.z);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(instanceIndex, dummy.matrix);
  };

  /**
   * 盤面状態を読み取り、石のインスタンス位置と表示数を更新する。
   * @param {Int8Array} board - 現在の盤面状態
   * @param {number | null} [activeLayer] - 指定した層のみ表示する。`null`/省略時は全層表示
   */
  const update = (board, activeLayer = null) => {
    let blackCount = 0;
    let whiteCount = 0;
    const now = performance.now();
    const nextPoppingStones = [];

    for (let z = 0; z < boardSize; z++) {
      if (activeLayer !== null && activeLayer !== z) continue;

      for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
          const flatIndex = indexOf(x, y, z, boardSize);
          const cell = board[flatIndex];
          if (cell === EMPTY) continue;

          const mesh = meshByColor[cell];
          const instanceIndex = cell === BLACK ? blackCount : whiteCount;
          setInstanceTransform(mesh, instanceIndex, x, y, z, 1);

          const hasChanged = previousBoard !== null && previousBoard[flatIndex] !== cell;
          if (hasChanged) {
            nextPoppingStones.push({ mesh, instanceIndex, x, y, z, startTime: now });
          }

          if (cell === BLACK) blackCount += 1;
          else whiteCount += 1;
        }
      }
    }

    blackMesh.count = blackCount;
    whiteMesh.count = whiteCount;
    blackMesh.instanceMatrix.needsUpdate = true;
    whiteMesh.instanceMatrix.needsUpdate = true;
    // InstancedMeshのboundingSphereは一度計算されるとキャッシュされ、setMatrixAt/countの
    // 変更だけでは自動更新されない。nullに戻し、次回のフラスタムカリング/レイキャスト時に
    // 現在のインスタンス配置で再計算させる（さもないと初期配置基準の古い範囲のまま固定され、
    // 盤面端に置かれた石が描画カリングで消えるおそれがある）。
    blackMesh.boundingSphere = null;
    whiteMesh.boundingSphere = null;
    blackMesh.boundingBox = null;
    whiteMesh.boundingBox = null;

    previousBoard = board.slice();
    poppingStones = nextPoppingStones;
  };

  /**
   * ポップ演出中の石があれば、経過時間に応じてスケールを更新する。
   * 毎フレーム呼び出す想定（`sceneManager.start()` のフレームコールバックから）。
   */
  const tick = () => {
    if (poppingStones.length === 0) return;

    const now = performance.now();
    let stillAnimating = false;

    for (const stone of poppingStones) {
      const elapsedSeconds = (now - stone.startTime) / 1000;
      const t = Math.min(elapsedSeconds / POP_DURATION_SECONDS, 1);
      if (t < 1) stillAnimating = true;

      const scale = POP_START_SCALE + (1 - POP_START_SCALE) * easeOutBack(t);
      setInstanceTransform(stone.mesh, stone.instanceIndex, stone.x, stone.y, stone.z, scale);
    }

    blackMesh.instanceMatrix.needsUpdate = true;
    whiteMesh.instanceMatrix.needsUpdate = true;
    if (!stillAnimating) poppingStones = [];
  };

  const dispose = () => {
    for (const mesh of Object.values(meshByColor)) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      scene.remove(mesh);
    }
  };

  return { update, tick, dispose };
};
