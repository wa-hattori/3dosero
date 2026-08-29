import { createInitialBoard, BLACK } from './logic/board.js';
import { getValidMoves, applyMove } from './logic/flip-rule.js';
import { getNextTurn } from './logic/game-state.js';
import { createSceneManager } from './render/scene-manager.js';
import { createCameraControls } from './render/camera-controls.js';
import { createBoardView } from './render/board-view.js';
import { createStoneView } from './render/stone-view.js';
import { createHighlightView } from './render/highlight-view.js';
import { createInteraction } from './ui/interaction.js';

const canvas = document.getElementById('board-canvas');
const sceneManager = createSceneManager(canvas);
const cameraControls = createCameraControls(sceneManager.camera, canvas);
createBoardView(sceneManager.scene);
const stoneView = createStoneView(sceneManager.scene);
const highlightView = createHighlightView(sceneManager.scene);

let board = createInitialBoard();
let currentTurn = BLACK;
let validMoves = getValidMoves(board, currentTurn);

const render = () => {
  stoneView.update(board);
  highlightView.update(validMoves);
};

render();

const handleMoveSelected = (instanceIndex) => {
  const move = validMoves[instanceIndex];
  if (move === undefined) return;

  const [x, y, z] = move;
  const next = applyMove(board, x, y, z, currentTurn);
  if (next === null) return;

  board = next;
  const nextTurn = getNextTurn(board, currentTurn);
  currentTurn = nextTurn ?? currentTurn;
  validMoves = nextTurn === null ? [] : getValidMoves(board, currentTurn);

  render();
};

createInteraction({
  domElement: canvas,
  camera: sceneManager.camera,
  highlightMesh: highlightView.mesh,
  onSelect: handleMoveSelected,
});

sceneManager.start(() => cameraControls.update());
