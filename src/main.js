import { createInitialBoard, BLACK, WHITE, oppositeColor } from './logic/board.js';
import { getValidMoves, applyMove } from './logic/flip-rule.js';
import { getNextTurn, getWinner, countStones } from './logic/game-state.js';
import { chooseRandomMove, RANDOM_CPU_LEVEL } from './logic/cpu.js';
import { loadModelSession } from './ai/model-loader.js';
import { chooseGanMove } from './ai/gan-cpu.js';
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

/**
 * CPUレベルに応じて着手を選ぶ。レベル1は既存のランダムCPU、レベル2以上は対応するONNXモデル
 * （初回のみロードし、以降は`model-loader.js`のキャッシュを再利用）でのGAN方策サンプリング
 * （[gan-cpu-self-play](../.claude/skills/gan-cpu-self-play/SKILL.md)）。モデルのロード・推論に
 * 失敗した場合はゲームを止めずランダムな着手にフォールバックする。
 * @param {Int8Array} board - 現在の盤面状態
 * @param {number} color - CPUの色
 * @param {number} boardSize - 盤面サイズ
 * @param {number} cpuLevel - CPUレベル（1〜5）
 * @returns {Promise<[number, number, number] | null>} 選んだ着手座標。合法手がなければ`null`
 */
const resolveCpuMove = async (board, color, boardSize, cpuLevel) => {
  if (cpuLevel === RANDOM_CPU_LEVEL) {
    return chooseRandomMove(board, color, boardSize);
  }

  try {
    const session = await loadModelSession(boardSize, cpuLevel);
    return await chooseGanMove(board, color, boardSize, session);
  } catch (error) {
    console.error('GAN CPUモデルの推論に失敗したため、ランダムな着手にフォールバックします', error);
    return chooseRandomMove(board, color, boardSize);
  }
};

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
 * 選択された対戦モード・盤面サイズ・CPUレベルで対局を開始する。3Dシーン・ゲーム状態・UIを一式構築する。
 * @param {{ battleMode: string, boardSize: number, cpuLevel: number | null }} selection - スタート画面での選択内容
 */
const startGame = ({ battleMode, boardSize, cpuLevel }) => {
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

    setTimeout(async () => {
      // ONNX推論は非同期（モデルの初回ロードを含む）だが、`isCpuTurn`によるステータス表示
      // （「CPU思考中…」）は着手が反映されるまで継続するため、待ち時間が伸びてもUIは
      // フリーズしない。失敗時は`resolveCpuMove`内でランダムな着手にフォールバックする。
      const move = await resolveCpuMove(board, CPU_COLOR, boardSize, cpuLevel);
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
