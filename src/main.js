import { createInitialBoard } from './logic/board.js';
import { createSceneManager } from './render/scene-manager.js';
import { createCameraControls } from './render/camera-controls.js';
import { createBoardView } from './render/board-view.js';
import { createStoneView } from './render/stone-view.js';

const canvas = document.getElementById('board-canvas');
const sceneManager = createSceneManager(canvas);
const cameraControls = createCameraControls(sceneManager.camera, canvas);
createBoardView(sceneManager.scene);
const stoneView = createStoneView(sceneManager.scene);

let board = createInitialBoard();
stoneView.update(board);

sceneManager.start(() => cameraControls.update());
