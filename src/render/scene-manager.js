import * as THREE from 'three';
import { BOARD_SIZE } from '../logic/board.js';

const CAMERA_FOV_DEGREES = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 200;
/** 盤面サイズに対する初期カメラ距離の比率（各軸の座標値）。boardSize=8で従来の16と一致。 */
const INITIAL_CAMERA_DISTANCE_RATIO = 2;
const BACKGROUND_COLOR = 0x111318;

/**
 * `Scene` / `Camera` / `WebGLRenderer` を1箇所で所有し、描画ループを管理する。
 * 他のモジュールはここが返すインスタンスを読み取るだけで、直接 `new THREE.Scene()`
 * 等をしない（[three-js-conventions](../../.claude/rules/javascript/three-js-conventions.md)）。
 * @param {HTMLCanvasElement} canvas - 描画先のcanvas要素
 * @param {number} [boardSize] - 盤面サイズ。初期カメラ距離のスケールに使う（省略時は `BOARD_SIZE`）
 * @returns {{
 *   scene: THREE.Scene,
 *   camera: THREE.PerspectiveCamera,
 *   renderer: THREE.WebGLRenderer,
 *   start: (onFrame?: (deltaSeconds: number) => void) => void,
 *   stop: () => void,
 * }}
 */
export const createSceneManager = (canvas, boardSize = BOARD_SIZE) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);

  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    window.innerWidth / window.innerHeight,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
  const initialCameraDistance = boardSize * INITIAL_CAMERA_DISTANCE_RATIO;
  camera.position.set(initialCameraDistance, initialCameraDistance, initialCameraDistance);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(10, 20, 15);
  scene.add(ambientLight, directionalLight);

  const handleResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', handleResize);

  let animationFrameId = null;
  let lastFrameTime = null;

  const start = (onFrame) => {
    const renderLoop = (now) => {
      const deltaSeconds = lastFrameTime === null ? 0 : (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      onFrame?.(deltaSeconds);
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(renderLoop);
    };
    animationFrameId = requestAnimationFrame(renderLoop);
  };

  const stop = () => {
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', handleResize);
  };

  return { scene, camera, renderer, start, stop };
};
