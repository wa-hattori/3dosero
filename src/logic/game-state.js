import { BLACK, WHITE } from './board.js';
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
 * @returns {boolean} ゲームが終了していれば true
 */
export const isGameOver = (board) => !hasValidMove(board, BLACK) && !hasValidMove(board, WHITE);
