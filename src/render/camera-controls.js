import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DAMPING_FACTOR = 0.08;
const MIN_DISTANCE = 6;
const MAX_DISTANCE = 40;

/**
 * VESTA的な全体回転・拡大縮小のカメラ操作を1モジュールに閉じ込める
 * （[three-js-conventions](../../.claude/rules/javascript/three-js-conventions.md)）。
 * @param {import('three').PerspectiveCamera} camera - 操作対象のカメラ
 * @param {HTMLElement} domElement - ポインタイベントを受け取る要素
 * @returns {{ update: () => void, dispose: () => void }}
 */
export const createCameraControls = (camera, domElement) => {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = DAMPING_FACTOR;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  controls.target.set(0, 0, 0);
  controls.update();

  const update = () => controls.update();
  const dispose = () => controls.dispose();

  return { update, dispose };
};
