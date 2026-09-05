import { BLACK, WHITE, colorKey } from '../logic/board.js';
import {
  COUNTDOWN_BEEP_THRESHOLD_MS,
  computeMoveTimeRemainingMs,
  computeMainBankRemainingMs,
  hasTimedOut,
} from '../net/game-timer.js';
import { playCountdownBeep } from '../audio/countdown-beep.js';

const COLOR_LABELS = { [BLACK]: '黒', [WHITE]: '白' };
/** 描画・タイムアウト判定のtick間隔。1秒未満にして表示のカクつきを抑える。 */
const TICK_INTERVAL_MS = 200;

/**
 * ミリ秒を`m:ss`形式の文字列にする。負の値は0として扱う。
 * @param {number} ms
 * @returns {string}
 */
const formatMs = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/**
 * オンライン対戦の一手タイマー・持ち時間を描画し、タイムアウトを検知する
 * （[online-match-timer](../../.claude/skills/online-match-timer/SKILL.md)参照）。
 * 両者の持ち時間を常時表示し、手番側は一手タイマーの残り秒数も表示する。
 * 一手タイマーの残りが`COUNTDOWN_BEEP_THRESHOLD_MS`以下になったら1秒ごとに
 * カウントダウン音を鳴らす。
 * @param {HTMLElement} container - 追加先要素
 * @param {(timedOutColor: number) => void} onTimeout - タイムアウトを検知した際に呼ばれる
 *   （呼び出し側で`submitTimeoutLoss`等に繋げる想定。この画面自体はFirestoreに書き込まない）
 * @returns {{
 *   update: (room: { timeBank: {black: number, white: number} | null, turnStartedAtMs: number | null, currentTurn: number, status: string }) => void,
 *   dispose: () => void,
 * }}
 */
export const createGameTimerView = (container, onTimeout) => {
  const panel = document.createElement('div');
  panel.className = 'game-timer-panel';

  const rows = {
    [BLACK]: document.createElement('div'),
    [WHITE]: document.createElement('div'),
  };
  for (const color of [BLACK, WHITE]) {
    rows[color].className = 'game-timer-row';
    panel.appendChild(rows[color]);
  }

  container.appendChild(panel);

  /** @type {{ timeBank: {black: number, white: number}, turnStartedAtMs: number, currentTurn: number, status: string } | null} */
  let state = null;
  let lastBeepSecond = null;
  let timeoutReported = false;

  const renderIdle = () => {
    rows[BLACK].textContent = `黒 ${formatMs(0)}`;
    rows[WHITE].textContent = `白 ${formatMs(0)}`;
    rows[BLACK].classList.remove('game-timer-row--active');
    rows[WHITE].classList.remove('game-timer-row--active');
  };

  const tick = () => {
    if (state === null || state.status !== 'in_progress' || state.turnStartedAtMs === null) {
      renderIdle();
      return;
    }

    const elapsedMs = Date.now() - state.turnStartedAtMs;
    const moverColor = state.currentTurn;
    const moverKey = colorKey(moverColor);

    const moveTimeRemainingMs = computeMoveTimeRemainingMs(elapsedMs);
    const mainBankRemainingMs = computeMainBankRemainingMs(state.timeBank[moverKey], elapsedMs);

    for (const color of [BLACK, WHITE]) {
      const remainingMs = color === moverColor ? mainBankRemainingMs : state.timeBank[colorKey(color)];
      const moveHint = color === moverColor ? `（残り${Math.max(0, Math.ceil(moveTimeRemainingMs / 1000))}秒）` : '';
      rows[color].textContent = `${COLOR_LABELS[color]} ${formatMs(remainingMs)}${moveHint}`;
      rows[color].classList.toggle('game-timer-row--active', color === moverColor);
    }

    if (moveTimeRemainingMs > 0 && moveTimeRemainingMs <= COUNTDOWN_BEEP_THRESHOLD_MS) {
      const currentSecond = Math.ceil(moveTimeRemainingMs / 1000);
      if (currentSecond !== lastBeepSecond) {
        lastBeepSecond = currentSecond;
        playCountdownBeep();
      }
    }

    if (!timeoutReported && hasTimedOut({ moveTimeRemainingMs, mainBankRemainingMs })) {
      timeoutReported = true;
      onTimeout(moverColor);
    }
  };

  const intervalId = setInterval(tick, TICK_INTERVAL_MS);
  renderIdle();

  /**
   * 部屋の最新状態を反映する。`subscribeToRoom`のコールバックのたびに呼ぶ想定。
   * @param {{ timeBank: {black: number, white: number} | null, turnStartedAtMs: number | null, currentTurn: number, status: string }} room
   */
  const update = (room) => {
    state =
      room.timeBank === null
        ? null
        : {
            timeBank: room.timeBank,
            turnStartedAtMs: room.turnStartedAtMs,
            currentTurn: room.currentTurn,
            status: room.status,
          };
    // 手番が変わるたびに呼ばれるため、カウントダウン音・タイムアウト検知の状態を
    // その都度リセットする(新しい手番として再武装する)。
    lastBeepSecond = null;
    timeoutReported = false;
    tick();
  };

  const dispose = () => {
    clearInterval(intervalId);
    panel.remove();
  };

  return { update, dispose };
};
