import { createInitialBoard, BLACK } from './logic/board.js';
import { getValidMoves } from './logic/flip-rule.js';
import { createSceneManager } from './render/scene-manager.js';
import { createCameraControls } from './render/camera-controls.js';
import { createBoardView } from './render/board-view.js';
import { createStoneView } from './render/stone-view.js';
import { createHighlightView } from './render/highlight-view.js';

const canvas = document.getElementById('board-canvas');
const sceneManager = createSceneManager(canvas);
const cameraControls = createCameraControls(sceneManager.camera, canvas);
createBoardView(sceneManager.scene);
const stoneView = createStoneView(sceneManager.scene);
const highlightView = createHighlightView(sceneManager.scene);

let board = createInitialBoard();
let currentTurn = BLACK;

stoneView.update(board);
highlightView.update(getValidMoves(board, currentTurn));

sceneManager.start(() => cameraControls.update());
