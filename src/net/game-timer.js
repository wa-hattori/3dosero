/**
 * オンライン対戦の一手タイマー・持ち時間の計算。Firebase依存を持たない純粋関数のみを
 * 置く（`rating.js`と同じ位置づけ。[online-match-timer](../../.claude/skills/online-match-timer/SKILL.md)参照）。
 * Firestoreへの実際の読み書き・DOM描画・タイマーのtickは`src/net/room-sync.js`・
 * `src/ui/game-timer-view.js`側の責務とする。
 */

/** 一手あたりに許される時間（ミリ秒）。これを超えると即座に負けになる。 */
export const MOVE_TIME_LIMIT_MS = 30_000;

/** 対局開始時の持ち時間（ミリ秒、片側あたり）。 */
export const MAIN_TIME_BANK_MS = 5 * 60 * 1000;

/** 一手タイマーの残りがこの値以下になったら、1秒ごとにカウントダウン音を鳴らす。 */
export const COUNTDOWN_BEEP_THRESHOLD_MS = 5_000;

/**
 * 対局開始時点の持ち時間（黒番・白番とも`MAIN_TIME_BANK_MS`）を作る。
 * @returns {{ black: number, white: number }}
 */
export const createInitialTimeBank = () => ({
  black: MAIN_TIME_BANK_MS,
  white: MAIN_TIME_BANK_MS,
});

/**
 * 現在の手番の一手タイマーの残り時間を求める。
 * @param {number} elapsedMs - 手番が始まってから経過した時間（ミリ秒）
 * @returns {number} 残り時間（ミリ秒）。0以下なら一手タイマーが切れている
 */
export const computeMoveTimeRemainingMs = (elapsedMs) => MOVE_TIME_LIMIT_MS - elapsedMs;

/**
 * 現在の手番の持ち時間の残り（この手番中の消費を差し引いた、いま現在の値）を求める。
 * 実際にFirestoreへ保存する値ではなく、描画・タイムアウト判定のための
 * ライブな値である点に注意（保存は`computeNextTimeBank`が行う）。
 * @param {number} bankMs - 手番開始時点で保存されていた持ち時間（ミリ秒）
 * @param {number} elapsedMs - 手番が始まってから経過した時間（ミリ秒）
 * @returns {number} 残り持ち時間（ミリ秒）。0以下なら持ち時間切れ
 */
export const computeMainBankRemainingMs = (bankMs, elapsedMs) => bankMs - elapsedMs;

/**
 * 一手タイマー・持ち時間のいずれかが切れているかどうかを判定する。
 * @param {{ moveTimeRemainingMs: number, mainBankRemainingMs: number }} params
 * @returns {boolean} どちらか一方でも0以下ならタイムアウト
 */
export const hasTimedOut = ({ moveTimeRemainingMs, mainBankRemainingMs }) =>
  moveTimeRemainingMs <= 0 || mainBankRemainingMs <= 0;

/**
 * 着手が成立した際の、次の持ち時間を求める。一手タイマー（`MOVE_TIME_LIMIT_MS`）の
 * うち使わなかった分を持ち時間に加算する（早く打つほど持ち時間が増え、ギリギリまで
 * 使うと持ち時間が減っていく。標準的なFischerインクリメントに近いが、増分が固定値
 * ではなく「一手タイマーの余り」である点が異なる）。
 * @param {number} bankMs - 手番開始時点の持ち時間（ミリ秒）
 * @param {number} elapsedMs - 実際に着手までにかかった時間（ミリ秒）
 * @returns {number} 次の持ち時間（ミリ秒）。0未満にはならない
 */
export const computeNextTimeBank = (bankMs, elapsedMs) => {
  const clampedElapsed = Math.min(Math.max(elapsedMs, 0), MOVE_TIME_LIMIT_MS);
  const leftoverMs = MOVE_TIME_LIMIT_MS - clampedElapsed;
  return Math.max(0, bankMs - clampedElapsed + leftoverMs);
};
