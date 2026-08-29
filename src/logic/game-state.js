import { BOARD_SIZE, BLACK, WHITE, oppositeColor } from './board.js';
import { hasValidMove } from './flip-rule.js';

/**
 * 盤面上の各色の石数を数える。
 * @param {Int8Array} board - 現在の盤面状態
 * @returns {{[BLACK]: number, [WHITE]: number}} 色ごとの石数
 */
export const countStones = (board) =>
  board.reduce(
    (counts, cell) => {
      if (cell === BLACK) counts[BLACK] += 1;
      if (cell === WHITE) counts[WHITE] += 1;
      return counts;
    },
    { [BLACK]: 0, [WHITE]: 0 },
  );

/**
 * 石数が多い方の色を返す。
 * @param {Int8Array} board - 現在の盤面状態
 * @returns {number | null} 石数が多い方の色（`BLACK` または `WHITE`）。同数なら `null`
 */
export const getWinner = (board) => {
  const counts = countStones(board);
  if (counts[BLACK] > counts[WHITE]) return BLACK;
  if (counts[WHITE] > counts[BLACK]) return WHITE;
  return null;
};

/**
 * ゲームが終了しているかどうかを判定する。
 * 両者とも着手可能な手が1つもなければ終了（盤面が満杯の場合も、この条件で自動的に含まれる）。
 * @param {Int8Array} board - 現在の盤面状態
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {boolean} ゲームが終了していれば true
 */
export const isGameOver = (board, boardSize = BOARD_SIZE) =>
  !hasValidMove(board, BLACK, boardSize) && !hasValidMove(board, WHITE, boardSize);

/**
 * 直前に `justMovedColor` が着手した後の、次の手番を返す。
 * 相手に着手可能な手があれば相手番、なければ（相手がパス）自分に着手可能な手が
 * あれば自分番、どちらも着手できなければゲーム終了として `null` を返す。
 * @param {Int8Array} board - 現在の盤面状態
 * @param {number} justMovedColor - 直前に着手した色（`BLACK` または `WHITE`）
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {number | null} 次の手番の色。ゲーム終了の場合は `null`
 */
export const getNextTurn = (board, justMovedColor, boardSize = BOARD_SIZE) => {
  const opponent = oppositeColor(justMovedColor);
  if (hasValidMove(board, opponent, boardSize)) return opponent;
  if (hasValidMove(board, justMovedColor, boardSize)) return justMovedColor;
  return null;
};
