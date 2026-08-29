import { createInitialBoard, BLACK, oppositeColor } from './logic/board.js';
import { getValidMoves, applyMove } from './logic/flip-rule.js';
import { getNextTurn, getWinner } from './logic/game-state.js';
import { createSceneManager } from './render/scene-manager.js';
import { createCameraControls } from './render/camera-controls.js';
import { createBoardView } from './render/board-view.js';
import { createStoneView } from './render/stone-view.js';
import { createHighlightView } from './render/highlight-view.js';
import { createInteraction } from './ui/interaction.js';
import { createStatusPanel } from './ui/status-panel.js';
import { createLayerControl } from './ui/layer-control.js';

const canvas = document.getElementById('board-canvas');
const uiOverlay = document.getElementById('ui-overlay');

const sceneManager = createSceneManager(canvas);
const cameraControls = createCameraControls(sceneManager.camera, canvas);
const boardView = createBoardView(sceneManager.scene);
const stoneView = createStoneView(sceneManager.scene);
const highlightView = createHighlightView(sceneManager.scene);
const statusPanel = createStatusPanel(uiOverlay);

let board = createInitialBoard();
let currentTurn = BLACK;
let validMoves = getValidMoves(board, currentTurn);
let isOver = false;
let winner = null;
let activeLayer = null;

const getVisibleMoves = () =>
  activeLayer === null ? validMoves : validMoves.filter(([, , z]) => z === activeLayer);

const render = (passedColor = null) => {
  boardView.setActiveLayer(activeLayer);
  stoneView.update(board, activeLayer);
  highlightView.update(getVisibleMoves());
  statusPanel.update({ currentTurn, passedColor, isOver, winner });
};

render();

const handleMoveSelected = (instanceIndex) => {
  const move = getVisibleMoves()[instanceIndex];
  if (move === undefined) return;

  const [x, y, z] = move;
  const next = applyMove(board, x, y, z, currentTurn);
  if (next === null) return;

  board = next;
  const opponent = oppositeColor(currentTurn);
  const nextTurn = getNextTurn(board, currentTurn);
  const passedColor = nextTurn === currentTurn ? opponent : null;

  isOver = nextTurn === null;
  winner = isOver ? getWinner(board) : null;
  currentTurn = nextTurn ?? currentTurn;
  validMoves = isOver ? [] : getValidMoves(board, currentTurn);

  render(passedColor);
};

createInteraction({
  domElement: canvas,
  camera: sceneManager.camera,
  highlightMesh: highlightView.mesh,
  onSelect: handleMoveSelected,
});

createLayerControl(uiOverlay, (layer) => {
  activeLayer = layer;
  render();
});

sceneManager.start(() => cameraControls.update());
