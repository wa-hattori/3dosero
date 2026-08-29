import * as THREE from 'three';
import { BOARD_SIZE } from '../logic/board.js';
import { CELL_SIZE, logicToWorld } from './board-layout.js';

const GRID_COLOR = 0x000000;
const PLANE_COLOR = 0x2f7a3d;
const PLANE_OPACITY = 0.35;
const GRID_OPACITY = 0.55;
/** z-fighting防止のため、グリッド線を面よりわずかに浮かせる。 */
const GRID_Y_OFFSET = 0.01;

/**
 * 8層分の緑地グリッド（黒線のマス目）を生成しシーンに追加する。
 * 層ごとの表示/非表示・不透明度の切り替えは、シーンを作り直さず
 * 各層メッシュの `visible`/`opacity` を更新することで行う
 * （[three-js-conventions](../../.claude/rules/javascript/three-js-conventions.md)）。
 * @param {import('three').Scene} scene - 追加先のシーン
 * @returns {{ group: import('three').Group, dispose: () => void }}
 */
export const createBoardView = (scene) => {
  const group = new THREE.Group();
  const boardExtent = BOARD_SIZE * CELL_SIZE;

  const planeGeometry = new THREE.PlaneGeometry(boardExtent, boardExtent);
  const planeMaterial = new THREE.MeshStandardMaterial({
    color: PLANE_COLOR,
    transparent: true,
    opacity: PLANE_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const gridHelpers = [];

  for (let z = 0; z < BOARD_SIZE; z++) {
    const layerY = logicToWorld(0, 0, z).y;

    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = layerY;
    group.add(plane);

    const gridHelper = new THREE.GridHelper(boardExtent, BOARD_SIZE, GRID_COLOR, GRID_COLOR);
    gridHelper.position.y = layerY + GRID_Y_OFFSET;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = GRID_OPACITY;
    group.add(gridHelper);
    gridHelpers.push(gridHelper);
  }

  scene.add(group);

  const dispose = () => {
    planeGeometry.dispose();
    planeMaterial.dispose();
    for (const gridHelper of gridHelpers) {
      gridHelper.geometry.dispose();
      gridHelper.material.dispose();
    }
    scene.remove(group);
  };

  return { group, dispose };
};
