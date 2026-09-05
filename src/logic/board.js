/** Number of cells along each axis of the default (standard) cubic board. */
export const BOARD_SIZE = 8;

/** 選択可能な盤面サイズ（各軸のマス数）。すべて偶数（初期配置が中心2×2×2キューブのため）。 */
export const SUPPORTED_BOARD_SIZES = [4, 6, 8];

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
 * 色を、Firestoreのマップ型フィールド（`ratingSnapshot`/`settled`/`timeBank`等、
 * 黒番・白番それぞれの値を持つオブジェクト）のキー名に変換する。
 * @param {number} color - `BLACK` または `WHITE`
 * @returns {'black' | 'white'}
 */
export const colorKey = (color) => (color === BLACK ? 'black' : 'white');

/**
 * 3D coordinates を盤面配列（`Int8Array`、長さ `boardSize ** 3`）上のフラットな
 * インデックスに変換する。
 * @param {number} x - x座標（0〜boardSize-1）
 * @param {number} y - y座標（0〜boardSize-1）
 * @param {number} z - z座標（0〜boardSize-1、層）
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {number} `board` 配列上のインデックス
 */
export const indexOf = (x, y, z, boardSize = BOARD_SIZE) =>
  x + y * boardSize + z * boardSize * boardSize;

/**
 * 座標が盤面の範囲内かどうかを判定する。
 * @param {number} x - x座標
 * @param {number} y - y座標
 * @param {number} z - z座標
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {boolean} x, y, z すべてが `[0, boardSize)` に収まっていれば true
 */
export const isOnBoard = (x, y, z, boardSize = BOARD_SIZE) => {
  if (x < 0 || x >= boardSize) return false;
  if (y < 0 || y >= boardSize) return false;
  if (z < 0 || z >= boardSize) return false;
  return true;
};

/**
 * 全マスが `EMPTY` の盤面を新規生成する。
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {Int8Array} 長さ `boardSize ** 3` の盤面配列
 */
export const createEmptyBoard = (boardSize = BOARD_SIZE) =>
  new Int8Array(boardSize * boardSize * boardSize);

/**
 * 初期配置を適用した盤面を生成する。
 *
 * 中心の2×2×2キューブ（`boardSize` が8なら x, y, z ∈ {3, 4}）に石を置き、
 * `(x + y + z)` が偶数なら `WHITE`、奇数なら `BLACK` とする。これは2Dオセロの
 * 標準初期配置（偶数マス=白、奇数マス=黒）を3方向に一貫して拡張したもので、
 * どの層で水平に切っても2Dオセロの初期配置と一致する
 * （[othello-3d-flip-rule](../../.claude/skills/othello-3d-flip-rule/SKILL.md) エッジケース5）。
 * `boardSize` は偶数である必要がある（中心2マスが常に存在するため）。
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {Int8Array} 初期配置済みの盤面配列
 */
export const createInitialBoard = (boardSize = BOARD_SIZE) => {
  const board = createEmptyBoard(boardSize);
  const CENTER_COORDS = [boardSize / 2 - 1, boardSize / 2];

  for (const x of CENTER_COORDS) {
    for (const y of CENTER_COORDS) {
      for (const z of CENTER_COORDS) {
        const color = (x + y + z) % 2 === 0 ? WHITE : BLACK;
        board[indexOf(x, y, z, boardSize)] = color;
      }
    }
  }

  return board;
};
