import { createInitialBoard, BLACK, WHITE, oppositeColor } from './logic/board.js';
import { getValidMoves, applyMove } from './logic/flip-rule.js';
import { getNextTurn, getWinner, countStones } from './logic/game-state.js';
import { chooseRandomMove } from './logic/cpu.js';
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
import { createHeroScene } from './render/hero-scene.js';
import { createStarfield } from './render/starfield-view.js';
import { createBgmPlayer } from './audio/bgm-player.js';
import { setClickSoundMuted } from './audio/click-sound.js';
import { createMuteToggle } from './ui/mute-toggle.js';
import { createTitleButton } from './ui/title-button.js';

/** 対戦モードごとの対局画面スターフィールドの色調。 */
const BATTLE_STARFIELD_COLORS = {
  cpu: 0xffffff,
  local: 0xffffff,
  online: 0xff5555,
};

/** CPU対戦モードでCPUが受け持つ色。人間は先手の黒を受け持つ。 */
const CPU_COLOR = WHITE;
/** CPUが着手するまでの間（考えているように見せるための演出）。 */
const CPU_MOVE_DELAY_MS = 700;

const canvas = document.getElementById('board-canvas');
const heroCanvas = document.getElementById('hero-canvas');
const uiOverlay = document.getElementById('ui-overlay');

const heroScene = createHeroScene(heroCanvas);

const bgmPlayer = createBgmPlayer();
createMuteToggle(uiOverlay, (muted) => {
  bgmPlayer.setMuted(muted);
  setClickSoundMuted(muted);
});

/**
 * 選択された対戦モード・盤面サイズで対局を開始する。3Dシーン・ゲーム状態・UIを一式構築する。
 * @param {{ battleMode: string, boardSize: number }} selection - スタート画面での選択内容
 */
const startGame = ({ battleMode, boardSize }) => {
  heroScene.stop();
  heroCanvas.style.display = 'none';
  bgmPlayer.play('battle');

  const sceneManager = createSceneManager(canvas, boardSize);
  const cameraControls = createCameraControls(sceneManager.camera, canvas, boardSize);
  const boardView = createBoardView(sceneManager.scene, boardSize);
  const stoneView = createStoneView(sceneManager.scene, boardSize);
  const highlightView = createHighlightView(sceneManager.scene, boardSize);
  const statusPanel = createStatusPanel(uiOverlay);
  createTitleButton(uiOverlay);
  const battleStarfield = createStarfield(sceneManager.scene, {
    mode: 'warp',
    color: BATTLE_STARFIELD_COLORS[battleMode] ?? BATTLE_STARFIELD_COLORS.local,
  });

  let board = createInitialBoard(boardSize);
  let currentTurn = BLACK;
  let validMoves = getValidMoves(board, currentTurn, boardSize);
  let isOver = false;
  let winner = null;
  let activeLayer = null;

  const isCpuTurn = () => battleMode === 'cpu' && currentTurn === CPU_COLOR;

  const getVisibleMoves = () => {
    // CPUの手番中は人間が代わりに着手できないよう、ハイライトを空にして
    // クリック対象を無くす（着手可能マス一覧自体は内部的に保持したまま）。
    if (isCpuTurn()) return [];
    return activeLayer === null ? validMoves : validMoves.filter(([, , z]) => z === activeLayer);
  };

  const render = (passedColor = null) => {
    boardView.setActiveLayer(activeLayer);
    stoneView.update(board, activeLayer);
    highlightView.update(getVisibleMoves());
    statusPanel.update({ currentTurn, passedColor, isOver, winner, isCpuTurn: isCpuTurn() });
  };

  render();

  const scheduleCpuMoveIfNeeded = () => {
    if (!isCpuTurn()) return;

    setTimeout(() => {
      const move = chooseRandomMove(board, CPU_COLOR, boardSize);
      if (move === null) return;
      applyMoveAndAdvance(move);
    }, CPU_MOVE_DELAY_MS);
  };

  /**
   * 指定した座標に現在の手番の色で着手し、盤面・手番・終了判定を進めて再描画する。
   * 人間のクリックとCPUの自動着手の両方から呼ばれる共通経路。
   * @param {[number, number, number]} move - 着手する座標
   */
  const applyMoveAndAdvance = ([x, y, z]) => {
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
      return;
    }

    scheduleCpuMoveIfNeeded();
  };

  const handleMoveSelected = (instanceIndex) => {
    const move = getVisibleMoves()[instanceIndex];
    if (move === undefined) return;
    applyMoveAndAdvance(move);
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

  sceneManager.start((deltaSeconds) => {
    cameraControls.update();
    battleStarfield.update(deltaSeconds);
    stoneView.tick();
  });
};

createStartScreen(uiOverlay, startGame, () => bgmPlayer.play('start'));
