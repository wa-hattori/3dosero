import { BLACK, WHITE } from './board.js';

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
