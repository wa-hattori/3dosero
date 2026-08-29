import { BOARD_SIZE } from './board.js';
import { getValidMoves } from './flip-rule.js';

/**
 * 最も弱いCPUレベル。このレベルだけは学習済みモデルを使わず、本モジュールの
 * `chooseRandomMove` で応答する（[gan-cpu-self-play](../../.claude/skills/gan-cpu-self-play/SKILL.md)）。
 */
export const RANDOM_CPU_LEVEL = 1;

/** 選択可能なCPUレベルの最大値（レベル2〜5はGAN CPU、[src/ai/](../ai/) が担当）。 */
export const MAX_CPU_LEVEL = 5;

/**
 * 合法手の中からランダムに1つ選んで返す、最も単純なCPU実装。
 * 将来構想のGANベースAI（[CLAUDE.md](../../CLAUDE.md)参照）とは別の、
 * 軽量なプレースホルダーCPU。「合法手の中から手を返す」契約は
 * [testing](../../.claude/rules/common/testing.md) に定める通り、CPUロジック共通の最低要件。
 * @param {Int8Array} board - 現在の盤面状態
 * @param {number} color - CPUの色（`BLACK` または `WHITE`）
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {[number, number, number] | null} 選んだ着手座標。合法手がなければ `null`
 */
export const chooseRandomMove = (board, color, boardSize = BOARD_SIZE) => {
  const moves = getValidMoves(board, color, boardSize);
  if (moves.length === 0) return null;

  const index = Math.floor(Math.random() * moves.length);
  return moves[index];
};
