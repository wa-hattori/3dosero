import { BOARD_SIZE, EMPTY, BLACK, WHITE, isOnBoard, indexOf } from './board.js';

/**
 * 26方向の探索ベクトル。`(0,0,0)` を除く `dx, dy, dz ∈ {-1, 0, 1}` の全組み合わせ。
 * 正本: [othello-3d-flip-rule](../../.claude/skills/othello-3d-flip-rule/SKILL.md)
 * @type {Array<[number, number, number]>}
 */
export const DIRECTIONS_3D = [];
for (let dz = -1; dz <= 1; dz++) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0 && dz === 0) continue;
      DIRECTIONS_3D.push([dx, dy, dz]);
    }
  }
}

const opposite = (color) => (color === BLACK ? WHITE : BLACK);

/**
 * 指定した座標に `color` の石を置いた場合に反転する座標一覧を返す。
 * アルゴリズムの正本: [othello-3d-flip-rule](../../.claude/skills/othello-3d-flip-rule/SKILL.md)
 * @param {Int8Array} board - 現在の盤面状態
 * @param {number} x0 - 石を置くx座標
 * @param {number} y0 - 石を置くy座標
 * @param {number} z0 - 石を置くz座標
 * @param {number} color - 置く石の色（`BLACK` または `WHITE`）
 * @returns {Array<[number, number, number]>} 反転対象の座標一覧（置けない場合は空配列）
 */
export const getFlippableStones = (board, x0, y0, z0, color) => {
  if (board[indexOf(x0, y0, z0)] !== EMPTY) return [];

  const opponent = opposite(color);
  const flippable = [];

  for (const [dx, dy, dz] of DIRECTIONS_3D) {
    const line = [];
    let x = x0 + dx;
    let y = y0 + dy;
    let z = z0 + dz;

    while (isOnBoard(x, y, z) && board[indexOf(x, y, z)] === opponent) {
      line.push([x, y, z]);
      x += dx;
      y += dy;
      z += dz;
    }

    if (line.length > 0 && isOnBoard(x, y, z) && board[indexOf(x, y, z)] === color) {
      flippable.push(...line);
    }
  }

  return flippable;
};

/**
 * 指定した座標に `color` の石を置けるかどうかを判定する。
 * @param {Int8Array} board - 現在の盤面状態
 * @param {number} x0 - 判定するx座標
 * @param {number} y0 - 判定するy座標
 * @param {number} z0 - 判定するz座標
 * @param {number} color - 置く石の色（`BLACK` または `WHITE`）
 * @returns {boolean} 1マス以上反転できる、着手可能な手であれば true
 */
export const isValidMove = (board, x0, y0, z0, color) =>
  getFlippableStones(board, x0, y0, z0, color).length > 0;

/**
 * 指定した座標に `color` の石を置き、挟んだ相手石をすべて反転した新しい盤面を返す。
 * 引数の `board` は書き換えない（[style-guide](../../.claude/rules/javascript/style-guide.md) の不変更新パターン）。
 * @param {Int8Array} board - 現在の盤面状態
 * @param {number} x0 - 石を置くx座標
 * @param {number} y0 - 石を置くy座標
 * @param {number} z0 - 石を置くz座標
 * @param {number} color - 置く石の色（`BLACK` または `WHITE`）
 * @returns {Int8Array | null} 着手後の新しい盤面。無効な手の場合は `null`
 */
export const applyMove = (board, x0, y0, z0, color) => {
  const flippable = getFlippableStones(board, x0, y0, z0, color);
  if (flippable.length === 0) return null;

  const next = board.slice();
  next[indexOf(x0, y0, z0)] = color;
  for (const [x, y, z] of flippable) {
    next[indexOf(x, y, z)] = color;
  }

  return next;
};

/**
 * `color` が着手可能な座標をすべて列挙する。
 * @param {Int8Array} board - 現在の盤面状態
 * @param {number} color - 手番の色（`BLACK` または `WHITE`）
 * @returns {Array<[number, number, number]>} 着手可能な座標一覧
 */
export const getValidMoves = (board, color) => {
  const moves = [];

  for (let z = 0; z < BOARD_SIZE; z++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (isValidMove(board, x, y, z, color)) {
          moves.push([x, y, z]);
        }
      }
    }
  }

  return moves;
};
