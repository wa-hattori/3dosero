/** Number of cells along each axis of the cubic board. */
export const BOARD_SIZE = 8;

/** Cell value: no stone placed. */
export const EMPTY = 0;
/** Cell value: a black stone. */
export const BLACK = 1;
/** Cell value: a white stone. */
export const WHITE = 2;

/**
 * 3D coordinates を盤面配列（`Int8Array`、長さ `BOARD_SIZE ** 3`）上のフラットな
 * インデックスに変換する。
 * @param {number} x - x座標（0〜BOARD_SIZE-1）
 * @param {number} y - y座標（0〜BOARD_SIZE-1）
 * @param {number} z - z座標（0〜BOARD_SIZE-1、層）
 * @returns {number} `board` 配列上のインデックス
 */
export const indexOf = (x, y, z) => x + y * BOARD_SIZE + z * BOARD_SIZE * BOARD_SIZE;

/**
 * 座標が盤面の範囲内かどうかを判定する。
 * @param {number} x - x座標
 * @param {number} y - y座標
 * @param {number} z - z座標
 * @returns {boolean} x, y, z すべてが `[0, BOARD_SIZE)` に収まっていれば true
 */
export const isOnBoard = (x, y, z) => {
  if (x < 0 || x >= BOARD_SIZE) return false;
  if (y < 0 || y >= BOARD_SIZE) return false;
  if (z < 0 || z >= BOARD_SIZE) return false;
  return true;
};
