import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOARD_SIZE } from '../logic/board.js';

const DAMPING_FACTOR = 0.08;
/** 盤面サイズに対する最小/最大ズーム距離の比率。boardSize=8で従来の6/40と一致。 */
const MIN_DISTANCE_RATIO = 0.75;
const MAX_DISTANCE_RATIO = 5;

/**
 * VESTA的な全体回転・拡大縮小のカメラ操作を1モジュールに閉じ込める
 * （[three-js-conventions](../../.claude/rules/javascript/three-js-conventions.md)）。
 * @param {import('three').PerspectiveCamera} camera - 操作対象のカメラ
 * @param {HTMLElement} domElement - ポインタイベントを受け取る要素
 * @param {number} [boardSize] - 盤面サイズ。ズーム範囲のスケールに使う（省略時は `BOARD_SIZE`）
 * @returns {{ update: () => void, dispose: () => void }}
 */
export const createCameraControls = (camera, domElement, boardSize = BOARD_SIZE) => {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = DAMPING_FACTOR;
  controls.minDistance = boardSize * MIN_DISTANCE_RATIO;
  controls.maxDistance = boardSize * MAX_DISTANCE_RATIO;
  controls.target.set(0, 0, 0);
  controls.update();

  const update = () => controls.update();
  const dispose = () => controls.dispose();

  return { update, dispose };
};
