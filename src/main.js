import { createInitialBoard, BLACK, oppositeColor } from './logic/board.js';
import { getValidMoves, applyMove } from './logic/flip-rule.js';
import { getNextTurn, getWinner, countStones } from './logic/game-state.js';
import { chooseRandomMove, RANDOM_CPU_LEVEL } from './logic/cpu.js';
import { loadModelSession } from './ai/model-loader.js';
import { chooseGanMove } from './ai/gan-cpu.js';
import { submitMove, subscribeToRoom, forfeitRoom, submitTimeoutLoss } from './net/room-sync.js';
import { settleRankedResult, settleRankedCpuMatch } from './net/rating-settlement.js';
import { MATCH_RESULT } from './net/rating.js';
import { notifyGameEnded } from './ads/interstitial-ads.js';
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
import { createScoreChangeScreen } from './ui/score-change-screen.js';
import { createGameTimerView } from './ui/game-timer-view.js';
import { createHeroScene } from './render/hero-scene.js';
import { createStarfield } from './render/starfield-view.js';
import { createBgmPlayer } from './audio/bgm-player.js';
import { setClickSoundMuted } from './audio/click-sound.js';
import { setCountdownBeepMuted } from './audio/countdown-beep.js';
import { createMuteToggle } from './ui/mute-toggle.js';
import { createTitleButton } from './ui/title-button.js';
import { createVersionBadge } from './ui/version-badge.js';

/** 対戦モードごとの対局画面スターフィールドの色調。 */
const BATTLE_STARFIELD_COLORS = {
  cpu: 0xffffff,
  local: 0xffffff,
  online: 0xff5555,
};

/** CPU対戦モードで、人間が色を選ばなかった場合のデフォルト（先手の黒）。 */
const DEFAULT_HUMAN_COLOR = BLACK;
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
  setCountdownBeepMuted(muted);
});
createVersionBadge(uiOverlay);

/**
 * 選択された対戦モード・盤面サイズ・CPUレベル（・オンライン接続情報）で対局を開始する。
 * 3Dシーン・ゲーム状態・UIを一式構築する。オンライン対戦モードでは、盤面の実体は
 * Firestore側にあり、ここでの`board`/`currentTurn`等はその購読結果のミラーに過ぎない
 * （[online-multiplayer](../.claude/skills/online-multiplayer/SKILL.md)参照）。
 * @param {{ battleMode: string, boardSize: number, cpuLevel: number | null, online: { roomId: string, color: number } | null, humanColor: number | null, rankedCpuMatch: { cpuLevel: number } | null }} selection -
 *   スタート画面での選択内容。`rankedCpuMatch`はランダムマッチングが不成立で
 *   CPU代替対戦になった場合のみ非`null`（[ranked-matchmaking](../.claude/skills/ranked-matchmaking/SKILL.md)の
 *   「CPU代替対戦」参照）
 */
const startGame = ({ battleMode, boardSize, cpuLevel, online, humanColor, rankedCpuMatch }) => {
  heroScene.stop();
  heroCanvas.style.display = 'none';
  bgmPlayer.play('battle');

  const sceneManager = createSceneManager(canvas, boardSize);
  const cameraControls = createCameraControls(sceneManager.camera, canvas, boardSize);
  const boardView = createBoardView(sceneManager.scene, boardSize);
  const stoneView = createStoneView(sceneManager.scene, boardSize);
  const highlightView = createHighlightView(sceneManager.scene, boardSize);
  const statusPanel = createStatusPanel(uiOverlay);
  const titleButton = createTitleButton(uiOverlay, {
    // オンライン対戦中に「タイトルに戻る」で離脱した場合、離脱した側を無条件で
    // 敗北・相手を無条件で勝利として通知する（相手がずっと待機状態のままに
    // ならないようにするため）。既に対局が終わっている場合は何もしない。
    onBeforeLeave: async () => {
      if (battleMode !== 'online' || isOver) return;
      await forfeitRoom({ roomId: online.roomId, myColor: myOnlineColor });
    },
  });
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
  // オンライン対戦の一手タイマー・持ち時間（購読で得た最新状態のミラー。
  // `submitOnlineMove`が着手送信時の経過時間計算に使う。
  // [online-match-timer](../.claude/skills/online-match-timer/SKILL.md)参照）。
  let timeBank = null;
  let turnStartedAtMs = null;

  /** オンライン対戦での自分の色。オンライン対戦以外では`null`。 */
  const myOnlineColor = battleMode === 'online' ? online.color : null;
  /** CPU対戦モードでCPUが受け持つ色。スタート画面で選んだ人間の色の逆。 */
  const cpuColor =
    battleMode === 'cpu' ? oppositeColor(humanColor ?? DEFAULT_HUMAN_COLOR) : null;

  // 一手タイマー・持ち時間はオンライン対戦のみ対象（CPU対戦・2人対戦〈同一端末〉には
  // 適用しない）。タイムアウトはどちらのクライアントが先に検知してもよい
  // （`submitTimeoutLoss`側で早い者勝ちのレースとして処理される）。
  const gameTimerView =
    battleMode === 'online'
      ? createGameTimerView(uiOverlay, (timedOutColor) => {
          submitTimeoutLoss({ roomId: online.roomId, timedOutColor });
        })
      : null;

  const isCpuTurn = () => battleMode === 'cpu' && currentTurn === cpuColor;
  const isWaitingForOpponentOnline = () =>
    battleMode === 'online' && currentTurn !== myOnlineColor;

  const getVisibleMoves = () => {
    // CPUの手番中・オンライン対戦で相手の手番中は、代わりに着手できないよう
    // ハイライトを空にしてクリック対象を無くす（着手可能マス一覧自体は内部的に保持したまま）。
    if (isCpuTurn() || isWaitingForOpponentOnline()) return [];
    return activeLayer === null ? validMoves : validMoves.filter(([, , z]) => z === activeLayer);
  };

  const render = (passedColor = null) => {
    boardView.setActiveLayer(activeLayer);
    stoneView.update(board, activeLayer);
    highlightView.update(getVisibleMoves());
    statusPanel.update({ currentTurn, passedColor, isOver, winner, isCpuTurn: isCpuTurn() });
  };

  render();

  // レート戦（ランダムマッチングのみ）の精算は1局につき1回でよい。この購読は
  // 自分の精算の書き込み（settled.<自分の色>の更新）自体でも再度発火するため、
  // フラグで二重の精算試行（実害はないが無駄な読み取りが発生する）を防ぐ。
  let rankedResultSettled = false;
  // 終了画面（end-screen/score-change-screen）も、精算完了を待ってから表示する
  // レート戦では上記とは別のタイミングで確定するため、独立したフラグで
  // 「既に表示したか」を管理する（相手側の精算書き込みによる再発火でも
  // 画面を重複生成しないようにするため）。
  let resultScreensShown = false;

  /**
   * 終了画面を表示する。レート戦の精算結果（`settlement`）があれば、「タイトルに戻る」
   * ボタンの代わりにスコア変動画面へ繋げる（未精算・非レート戦では`null`を渡し、
   * これまで通り即座にタイトルへ戻る）。オンライン対戦・CPU代替対戦の両方から使う
   * 共通部分（[ranked-matchmaking](../.claude/skills/ranked-matchmaking/SKILL.md)参照）。
   * @param {{ beforeScore: number, afterScore: number, delta: number } | null} settlement
   */
  const showEndScreen = (settlement) => {
    const endScreen = createEndScreen(uiOverlay, {
      winner,
      counts: countStones(board),
      onContinue: settlement
        ? () => {
            endScreen.dispose();
            createScoreChangeScreen(uiOverlay, settlement);
          }
        : undefined,
    });
  };

  if (battleMode === 'online') {
    // オンライン対戦では盤面の実体をFirestore側に置き、この購読が状態更新の
    // 唯一の経路になる（自分の着手の反映も、相手の着手の反映も同じ経路を通る）。
    subscribeToRoom(online.roomId, (room) => {
      board = room.board;
      currentTurn = room.currentTurn;
      isOver = room.status === 'finished';
      winner = isOver ? room.winner : null;
      validMoves = isOver ? [] : getValidMoves(board, currentTurn, boardSize);
      timeBank = room.timeBank;
      turnStartedAtMs = room.turnStartedAtMs;
      gameTimerView.update(room);

      render();

      if (isOver) {
        notifyGameEnded();

        const showResultScreens = (settlement) => {
          if (resultScreensShown) return;
          resultScreensShown = true;
          // 対局画面の「← タイトルに戻る」ボタンは、終了画面が覆っている間はもう
          // 押させたくない（見た目上は隠れていても、キーボード操作等では届いてしまう）。
          titleButton.dispose();
          gameTimerView.dispose();
          showEndScreen(settlement);
        };

        if (!room.ranked) {
          showResultScreens(null);
        } else if (!rankedResultSettled) {
          rankedResultSettled = true;
          const myResult =
            winner === null
              ? MATCH_RESULT.DRAW
              : winner === myOnlineColor
                ? MATCH_RESULT.WIN
                : MATCH_RESULT.LOSS;
          settleRankedResult({ roomId: online.roomId, myColor: myOnlineColor, myResult })
            .then((settlement) => showResultScreens(settlement))
            .catch((error) => {
              console.error('レート戦の結果精算に失敗しました', error);
              showResultScreens(null);
            });
        }
      }
    });
  }

  const scheduleCpuMoveIfNeeded = () => {
    if (!isCpuTurn()) return;

    setTimeout(async () => {
      // ONNX推論は非同期（モデルの初回ロードを含む）だが、`isCpuTurn`によるステータス表示
      // （「CPU思考中…」）は着手が反映されるまで継続するため、待ち時間が伸びてもUIは
      // フリーズしない。失敗時は`resolveCpuMove`内でランダムな着手にフォールバックする。
      const move = await resolveCpuMove(board, cpuColor, boardSize, cpuLevel);
      if (move === null) return;
      applyMoveAndAdvance(move);
    }, CPU_MOVE_DELAY_MS);
  };

  // 人間が後手（白）を選んだ場合、CPU（黒）が先手として最初の一手を打つ必要がある。
  // それ以外の手番進行は`applyMoveAndAdvance`末尾からの呼び出しでまかなえるが、
  // ゲーム開始直後だけはここで明示的にきっかけを作る必要がある。
  scheduleCpuMoveIfNeeded();

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
      notifyGameEnded();
      titleButton.dispose();

      // ランダムマッチングが不成立でCPU代替対戦になった場合のみ、対人戦のレート戦と
      // 同じ精算コードを通してスコア変動画面まで繋げる（[ranked-matchmaking](../.claude/skills/ranked-matchmaking/SKILL.md)の
      // 「CPU代替対戦」参照）。通常のCPU対戦・2人対戦はレートに影響しない。
      if (rankedCpuMatch) {
        const myResult =
          winner === null
            ? MATCH_RESULT.DRAW
            : winner === humanColor
              ? MATCH_RESULT.WIN
              : MATCH_RESULT.LOSS;
        settleRankedCpuMatch({ boardSize, board, cpuLevel: rankedCpuMatch.cpuLevel, myResult })
          .then((settlement) => showEndScreen(settlement))
          .catch((error) => {
            console.error('CPU代替対戦の結果精算に失敗しました', error);
            showEndScreen(null);
          });
        return;
      }

      showEndScreen(null);
      return;
    }

    scheduleCpuMoveIfNeeded();
  };

  /**
   * オンライン対戦での着手をFirestoreに送信する。盤面・手番の更新は
   * `subscribeToRoom`のコールバック経由で反映されるため、ここではローカルの
   * 状態を直接変更しない（両クライアントの状態が食い違わないようにするため）。
   * @param {[number, number, number]} move - 着手する座標
   */
  const submitOnlineMove = async ([x, y, z]) => {
    try {
      await submitMove({
        roomId: online.roomId,
        board,
        boardSize,
        color: myOnlineColor,
        x,
        y,
        z,
        timeBank,
        elapsedMs: turnStartedAtMs === null ? 0 : Date.now() - turnStartedAtMs,
      });
    } catch (error) {
      console.error('着手の送信に失敗しました', error);
    }
  };

  const handleMoveSelected = (instanceIndex) => {
    const move = getVisibleMoves()[instanceIndex];
    if (move === undefined) return;
    if (battleMode === 'online') {
      submitOnlineMove(move);
      return;
    }
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
