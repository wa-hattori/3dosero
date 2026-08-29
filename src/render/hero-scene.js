import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createInitialBoard } from '../logic/board.js';
import { createBoardView } from './board-view.js';
import { createStoneView } from './stone-view.js';
import { createStarfield } from './starfield-view.js';

/** スタート画面の装飾に使う、小さめの盤面サイズ。 */
const HERO_BOARD_SIZE = 4;
const CAMERA_FOV_DEGREES = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 200;
const CAMERA_DISTANCE = HERO_BOARD_SIZE * 2.4;
const AUTO_ROTATE_SPEED = 1.2;
const BACKGROUND_COLOR = 0x05060a;

/**
 * スタート画面の背景として、ドラッグで回転できる立体オセロの装飾と
 * 宇宙空間風のスターフィールドを表示する、独立したScene/Camera/Rendererを
 * 生成する。対局用の`#board-canvas`とは別のcanvas上に構築し、対局開始時に
 * `stop()` を呼ぶだけで安全に破棄できるようにする
 * （WebGLコンテキストの競合・リソースリークを避けるため、
 * [three-js-conventions](../../.claude/rules/javascript/three-js-conventions.md)）。
 * @param {HTMLCanvasElement} canvas - 描画先のcanvas要素（`#hero-canvas`）
 * @returns {{ stop: () => void }}
 */
export const createHeroScene = (canvas) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);

  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    window.innerWidth / window.innerHeight,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
  camera.position.set(CAMERA_DISTANCE, CAMERA_DISTANCE * 0.8, CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(6, 10, 8);
  scene.add(ambientLight, directionalLight);

  const starfield = createStarfield(scene, { mode: 'ambient', color: 0xffffff });
  const boardView = createBoardView(scene, HERO_BOARD_SIZE);
  const stoneView = createStoneView(scene, HERO_BOARD_SIZE);
  stoneView.update(createInitialBoard(HERO_BOARD_SIZE));

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.target.set(0, 0, 0);

  const handleResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', handleResize);

  let animationFrameId = null;
  let lastTime = performance.now();

  const renderLoop = () => {
    const now = performance.now();
    const deltaSeconds = (now - lastTime) / 1000;
    lastTime = now;

    controls.update();
    starfield.update(deltaSeconds);
    renderer.render(scene, camera);
    animationFrameId = requestAnimationFrame(renderLoop);
  };
  animationFrameId = requestAnimationFrame(renderLoop);

  /**
   * 描画ループを止め、確保したリソースをすべて破棄する。
   */
  const stop = () => {
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', handleResize);
    controls.dispose();
    boardView.dispose();
    stoneView.dispose();
    starfield.dispose();
    renderer.dispose();
  };

  return { stop };
};
