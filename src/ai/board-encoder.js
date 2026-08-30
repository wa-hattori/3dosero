import { BOARD_SIZE, oppositeColor } from '../logic/board.js';

/**
 * 盤面状態を、GAN CPUモデル（ONNX）の入力テンソルに変換する。
 *
 * `training/board_encoding.py` の `encode_board` と同じ規約: 論理的な shape は
 * `(2, boardSize, boardSize, boardSize)`、軸は `(channel, z, y, x)`、
 * channel 0 = 自分（`color`）の石、channel 1 = 相手の石。
 *
 * `board.js` の `indexOf(x, y, z, boardSize) = x + y*boardSize + z*boardSize²` は
 * 「xが最も速く変化し、次にy、最後にz」という行優先順のフラット化そのものであり、
 * これは3D配列を `(channel, z, y, x)` 軸で行優先フラット化したときのメモリレイアウトと
 * 完全に一致する。そのため座標変換は不要で、`board[i]` をそのまま
 * `tensor[channel * cellCount + i]` に書き込むだけでよい。
 * @param {Int8Array} board - 現在の盤面状態
 * @param {number} color - エンコード対象の手番の色（`BLACK` または `WHITE`）
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {Float32Array} 長さ `2 * boardSize³` のフラット化された入力テンソルデータ
 */
export const encodeBoardForModel = (board, color, boardSize = BOARD_SIZE) => {
  const opponent = oppositeColor(color);
  const cellCount = boardSize * boardSize * boardSize;
  const tensor = new Float32Array(2 * cellCount);

  for (let i = 0; i < cellCount; i += 1) {
    const cell = board[i];
    if (cell === color) {
      tensor[i] = 1;
    } else if (cell === opponent) {
      tensor[cellCount + i] = 1;
    }
  }

  return tensor;
};
