/** Number of cells along each axis of the cubic board. */
export const BOARD_SIZE = 8;

/** Cell value: no stone placed. */
export const EMPTY = 0;
/** Cell value: a black stone. */
export const BLACK = 1;
/** Cell value: a white stone. */
export const WHITE = 2;

/**
 * 指定した石の色の相手の色を返す。
 * @param {number} color - `BLACK` または `WHITE`
 * @returns {number} 相手の色（`BLACK` なら `WHITE`、`WHITE` なら `BLACK`）
 */
export const oppositeColor = (color) => (color === BLACK ? WHITE : BLACK);

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

/**
 * 全マスが `EMPTY` の盤面を新規生成する。
 * @returns {Int8Array} 長さ `BOARD_SIZE ** 3` の盤面配列
 */
export const createEmptyBoard = () => new Int8Array(BOARD_SIZE * BOARD_SIZE * BOARD_SIZE);

/**
 * 初期配置を適用した盤面を生成する。
 *
 * 中心の2×2×2キューブ（x, y, z ∈ {3, 4}）に石を置き、`(x + y + z)` が偶数なら
 * `WHITE`、奇数なら `BLACK` とする。これは2Dオセロの標準初期配置（偶数マス=白、
 * 奇数マス=黒）を3方向に一貫して拡張したもので、どの層で水平に切っても2Dオセロの
 * 初期配置と一致する（[othello-3d-flip-rule](../../.claude/skills/othello-3d-flip-rule/SKILL.md) エッジケース5）。
 * @returns {Int8Array} 初期配置済みの盤面配列
 */
export const createInitialBoard = () => {
  const board = createEmptyBoard();
  const CENTER_COORDS = [3, 4];

  for (const x of CENTER_COORDS) {
    for (const y of CENTER_COORDS) {
      for (const z of CENTER_COORDS) {
        const color = (x + y + z) % 2 === 0 ? WHITE : BLACK;
        board[indexOf(x, y, z)] = color;
      }
    }
  }

  return board;
};
