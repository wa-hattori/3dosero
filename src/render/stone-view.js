import * as THREE from 'three';
import { BOARD_SIZE, EMPTY, BLACK, WHITE, indexOf } from '../logic/board.js';
import { CELL_SIZE, logicToWorld } from './board-layout.js';

const STONE_RADIUS = CELL_SIZE * 0.35;
const STONE_SEGMENTS = 16;
/** 1色が理論上取りうる最大石数（盤面の全マス）。InstancedMeshの安全な上限値。 */
const MAX_STONES_PER_COLOR = BOARD_SIZE * BOARD_SIZE * BOARD_SIZE;

const BLACK_STONE_COLOR = 0x1a1a1a;
const WHITE_STONE_COLOR = 0xf2f2f2;

const dummy = new THREE.Object3D();

const createStoneMesh = (scene, color) => {
  const geometry = new THREE.SphereGeometry(STONE_RADIUS, STONE_SEGMENTS, STONE_SEGMENTS);
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.InstancedMesh(geometry, material, MAX_STONES_PER_COLOR);
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
};

/**
 * `BLACK`/`WHITE` それぞれの石を1つの`InstancedMesh`で描画する。
 * 石1個ごとにメッシュを新規生成せず、色ごとに共有ジオメトリ/マテリアルを使い回す
 * （[three-js-conventions](../../.claude/rules/javascript/three-js-conventions.md)）。
 * @param {import('three').Scene} scene - 追加先のシーン
 * @returns {{ update: (board: Int8Array) => void, dispose: () => void }}
 */
export const createStoneView = (scene) => {
  const blackMesh = createStoneMesh(scene, BLACK_STONE_COLOR);
  const whiteMesh = createStoneMesh(scene, WHITE_STONE_COLOR);
  const meshByColor = { [BLACK]: blackMesh, [WHITE]: whiteMesh };

  /**
   * 盤面状態を読み取り、石のインスタンス位置と表示数を更新する。
   * @param {Int8Array} board - 現在の盤面状態
   */
  const update = (board) => {
    let blackCount = 0;
    let whiteCount = 0;

    for (let z = 0; z < BOARD_SIZE; z++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          const cell = board[indexOf(x, y, z)];
          if (cell === EMPTY) continue;

          const world = logicToWorld(x, y, z);
          dummy.position.set(world.x, world.y, world.z);
          dummy.updateMatrix();

          if (cell === BLACK) {
            blackMesh.setMatrixAt(blackCount, dummy.matrix);
            blackCount += 1;
          } else if (cell === WHITE) {
            whiteMesh.setMatrixAt(whiteCount, dummy.matrix);
            whiteCount += 1;
          }
        }
      }
    }

    blackMesh.count = blackCount;
    whiteMesh.count = whiteCount;
    blackMesh.instanceMatrix.needsUpdate = true;
    whiteMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = () => {
    for (const mesh of Object.values(meshByColor)) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      scene.remove(mesh);
    }
  };

  return { update, dispose };
};
