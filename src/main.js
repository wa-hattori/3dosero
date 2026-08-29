import { createInitialBoard, BLACK, oppositeColor } from './logic/board.js';
import { getValidMoves, applyMove } from './logic/flip-rule.js';
import { getNextTurn, getWinner, countStones } from './logic/game-state.js';
import { createSceneManager } from './render/scene-manager.js';
import { createCameraControls } from './render/camera-controls.js';
import { createBoardView } from './render/board-view.js';
import { createStoneView } from './render/stone-view.js';
import { createHighlightView } from './render/highlight-view.js';
import { createInteraction } from './ui/interaction.js';
import { createStatusPanel } from './ui/status-panel.js';
import { createLayerControl } from './ui/layer-control.js';
import { createStartScreen } from './ui/start-screen.js';
import { createEndScreen } from './ui/end-screen.js';

const canvas = document.getElementById('board-canvas');
const uiOverlay = document.getElementById('ui-overlay');

/**
 * 選択された盤面サイズで対局を開始する。3Dシーン・ゲーム状態・UIを一式構築する。
 * @param {number} boardSize - 盤面サイズ（`SUPPORTED_BOARD_SIZES` のいずれか）
 */
const startGame = (boardSize) => {
  const sceneManager = createSceneManager(canvas, boardSize);
  const cameraControls = createCameraControls(sceneManager.camera, canvas, boardSize);
  const boardView = createBoardView(sceneManager.scene, boardSize);
  const stoneView = createStoneView(sceneManager.scene, boardSize);
  const highlightView = createHighlightView(sceneManager.scene, boardSize);
  const statusPanel = createStatusPanel(uiOverlay);

  let board = createInitialBoard(boardSize);
  let currentTurn = BLACK;
  let validMoves = getValidMoves(board, currentTurn, boardSize);
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
    const next = applyMove(board, x, y, z, currentTurn, boardSize);
    if (next === null) return;

    board = next;
    const opponent = oppositeColor(currentTurn);
    const nextTurn = getNextTurn(board, currentTurn, boardSize);
    const passedColor = nextTurn === currentTurn ? opponent : null;

    isOver = nextTurn === null;
    winner = isOver ? getWinner(board) : null;
    currentTurn = nextTurn ?? currentTurn;
    validMoves = isOver ? [] : getValidMoves(board, currentTurn, boardSize);

    render(passedColor);

    if (isOver) {
      createEndScreen(uiOverlay, { winner, counts: countStones(board) });
    }
  };

  const interaction = createInteraction({
    domElement: canvas,
    camera: sceneManager.camera,
    highlightMesh: highlightView.mesh,
    onSelect: handleMoveSelected,
    onPendingChange: (instanceIndex) => highlightView.setEmphasized(instanceIndex),
  });

  createLayerControl(
    uiOverlay,
    (layer) => {
      // 層を切り替えるとハイライト対象のマス構成が変わるため、切り替え前の
      // 1タップ目の保留状態を破棄する（放置すると、別の層への切り替え後の
      // タップが誤ってダブルタップとして結合されてしまう）。
      interaction.cancelPendingTap();
      activeLayer = layer;
      render();
    },
    boardSize,
  );

  sceneManager.start(() => cameraControls.update());
};

createStartScreen(uiOverlay, startGame);
