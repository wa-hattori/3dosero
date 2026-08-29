import * as THREE from 'three';
import { BOARD_SIZE } from '../logic/board.js';
import { CELL_SIZE, logicToWorld, getLayerSurfaceY } from './board-layout.js';

const HIGHLIGHT_COLOR = 0xbbbbbb;
const HIGHLIGHT_OPACITY = 0.55;
const HIGHLIGHT_SIZE_RATIO = 0.9;
/** z-fighting防止のため、ハイライト面を板の上面・グリッド線よりわずかに浮かせる。 */
const HIGHLIGHT_Y_OFFSET = 0.02;
/** 理論上取りうる最大着手可能マス数（盤面の全マス）。InstancedMeshの安全な上限値。 */
const MAX_HIGHLIGHTS = BOARD_SIZE * BOARD_SIZE * BOARD_SIZE;

const dummy = new THREE.Object3D();

/**
 * 着手可能マスを灰色でハイライトする。マスの数だけ動的にジオメトリを生成せず、
 * あらかじめ用意した1つの`InstancedMesh`の表示数・座標更新のみで行う
 * （[three-js-conventions](../../.claude/rules/javascript/three-js-conventions.md)）。
 * @param {import('three').Scene} scene - 追加先のシーン
 * @returns {{
 *   mesh: import('three').InstancedMesh,
 *   update: (moves: Array<[number, number, number]>) => void,
 *   dispose: () => void,
 * }}
 */
export const createHighlightView = (scene) => {
  const geometry = new THREE.PlaneGeometry(
    CELL_SIZE * HIGHLIGHT_SIZE_RATIO,
    CELL_SIZE * HIGHLIGHT_SIZE_RATIO,
  );
  const material = new THREE.MeshBasicMaterial({
    color: HIGHLIGHT_COLOR,
    transparent: true,
    opacity: HIGHLIGHT_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, MAX_HIGHLIGHTS);
  mesh.count = 0;
  scene.add(mesh);

  /**
   * 着手可能マスの座標一覧で表示を更新する。
   * @param {Array<[number, number, number]>} moves - `getValidMoves` が返す座標一覧
   */
  const update = (moves) => {
    moves.forEach(([x, y, z], index) => {
      const world = logicToWorld(x, y, z);
      dummy.position.set(world.x, getLayerSurfaceY(z) + HIGHLIGHT_Y_OFFSET, world.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });

    mesh.count = moves.length;
    mesh.instanceMatrix.needsUpdate = true;
    // InstancedMeshのboundingSphereはキャッシュされ、setMatrixAt/countの変更だけでは
    // 自動更新されない。nullに戻して次回のレイキャスト/フラスタムカリング時に現在の
    // ハイライト配置で再計算させる。放置すると、最初にキャッシュされた（盤面中央寄りの）
    // 古い範囲のままになり、盤面端・角の着手可能マスをクリックしても
    // raycaster.ray.intersectsSphere() が false を返し、クリックが反応しなくなる。
    mesh.boundingSphere = null;
    mesh.boundingBox = null;
  };

  const dispose = () => {
    geometry.dispose();
    material.dispose();
    scene.remove(mesh);
  };

  return { mesh, update, dispose };
};
