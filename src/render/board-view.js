import * as THREE from 'three';
import { BOARD_SIZE } from '../logic/board.js';
import { CELL_SIZE, LAYER_THICKNESS, logicToWorld, getLayerSurfaceY } from './board-layout.js';

const GRID_COLOR = 0x000000;
const PLANE_COLOR = 0x2f7a3d;
const PLANE_OPACITY = 0.35;
/** 特定の1層だけに絞り込んだ時の不透明度（他層は非表示になるため、より濃く見せる）。 */
const SINGLE_LAYER_PLANE_OPACITY = 0.85;
const GRID_OPACITY = 0.55;
/** z-fighting防止のため、グリッド線を板の上面よりわずかに浮かせる。 */
const GRID_Y_OFFSET = 0.01;

/**
 * 8層分の緑地グリッド（黒線のマス目）を生成しシーンに追加する。
 * 層ごとの表示/非表示・不透明度の切り替えは、シーンを作り直さず
 * 各層メッシュの `visible`/`opacity` を更新することで行う
 * （[three-js-conventions](../../.claude/rules/javascript/three-js-conventions.md)）。
 * @param {import('three').Scene} scene - 追加先のシーン
 * @returns {{
 *   group: import('three').Group,
 *   setActiveLayer: (activeLayer: number | null) => void,
 *   dispose: () => void,
 * }}
 */
export const createBoardView = (scene) => {
  const group = new THREE.Group();
  const boardExtent = BOARD_SIZE * CELL_SIZE;

  const planeGeometry = new THREE.BoxGeometry(boardExtent, LAYER_THICKNESS, boardExtent);
  const planeMaterial = new THREE.MeshStandardMaterial({
    color: PLANE_COLOR,
    transparent: true,
    opacity: PLANE_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const planeMeshes = [];
  const gridHelpers = [];

  for (let z = 0; z < BOARD_SIZE; z++) {
    const layerY = logicToWorld(0, 0, z).y;

    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.position.y = layerY;
    group.add(plane);
    planeMeshes.push(plane);

    const gridHelper = new THREE.GridHelper(boardExtent, BOARD_SIZE, GRID_COLOR, GRID_COLOR);
    gridHelper.position.y = getLayerSurfaceY(z) + GRID_Y_OFFSET;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = GRID_OPACITY;
    group.add(gridHelper);
    gridHelpers.push(gridHelper);
  }

  scene.add(group);

  /**
   * 表示する層を絞り込む。既存メッシュの`visible`/`opacity`のみ更新し、
   * シーンは作り直さない。
   * @param {number | null} activeLayer - 表示する層（`z`）。`null` なら全層表示
   */
  const setActiveLayer = (activeLayer) => {
    planeMaterial.opacity = activeLayer === null ? PLANE_OPACITY : SINGLE_LAYER_PLANE_OPACITY;

    for (let z = 0; z < BOARD_SIZE; z++) {
      const isVisible = activeLayer === null || activeLayer === z;
      planeMeshes[z].visible = isVisible;
      gridHelpers[z].visible = isVisible;
    }
  };

  const dispose = () => {
    planeGeometry.dispose();
    planeMaterial.dispose();
    for (const gridHelper of gridHelpers) {
      gridHelper.geometry.dispose();
      gridHelper.material.dispose();
    }
    scene.remove(group);
  };

  return { group, setActiveLayer, dispose };
};
