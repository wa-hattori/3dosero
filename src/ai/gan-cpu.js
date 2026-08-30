import { BOARD_SIZE, indexOf } from '../logic/board.js';
import { getValidMoves } from '../logic/flip-rule.js';
import { encodeBoardForModel } from './board-encoder.js';

/**
 * モデル出力の方策ロジット（`indexOf(x,y,z,boardSize)` 順、未softmax・未マスク）を、
 * 合法手のインデックスだけに絞ってsoftmaxし、確率分布に変換する純粋関数。
 * ブラウザ推論仕様の正本: [gan-cpu-self-play](../../.claude/skills/gan-cpu-self-play/SKILL.md)。
 * @param {Float32Array | number[]} policyLogits - モデル出力の生ロジット（長さ `boardSize³`）
 * @param {Array<[number, number, number]>} legalMoves - `getValidMoves` で得た合法手一覧
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {number[]} `legalMoves` と同じ順序の確率分布（合計はおよそ1）。`legalMoves` が空なら空配列
 */
export const computeLegalMovePolicy = (policyLogits, legalMoves, boardSize = BOARD_SIZE) => {
  if (legalMoves.length === 0) return [];

  const legalLogits = legalMoves.map(([x, y, z]) => policyLogits[indexOf(x, y, z, boardSize)]);
  const maxLogit = Math.max(...legalLogits);
  const expValues = legalLogits.map((logit) => Math.exp(logit - maxLogit));
  const sumExp = expValues.reduce((sum, value) => sum + value, 0);

  return expValues.map((value) => value / sumExp);
};

/**
 * 確率分布から重み付きサンプリングで1つのインデックスを選ぶ純粋関数。
 * @param {number[]} probabilities - 合計がおよそ1になる確率分布
 * @param {number} [randomValue] - `[0, 1)` の乱数。テストで決定論的に指定できるよう引数化する
 * @returns {number} 選ばれた要素のインデックス。`probabilities` が空なら `-1`
 */
export const sampleMoveIndex = (probabilities, randomValue = Math.random()) => {
  if (probabilities.length === 0) return -1;

  let cumulative = 0;
  for (let i = 0; i < probabilities.length; i += 1) {
    cumulative += probabilities[i];
    if (randomValue < cumulative) return i;
  }

  // 浮動小数点の丸め誤差で累積和がわずかに1未満のまま終わることがあるためのガード。
  return probabilities.length - 1;
};

/**
 * GAN CPUモデル（ONNX）の推論結果に基づき、合法手の中から1手を選ぶ。
 * ブラウザ側ではMCTSは実行せず、方策ロジットを合法手だけに絞ってsoftmaxし、
 * その確率分布から重み付きサンプリングする
 * （[gan-cpu-self-play](../../.claude/skills/gan-cpu-self-play/SKILL.md) のブラウザ推論仕様）。
 * 「合法手の中から手を返す」契約は `chooseRandomMove`（[cpu.js](../logic/cpu.js)）と同じ
 * （[testing.md](../../.claude/rules/common/testing.md)）。
 * @param {Int8Array} board - 現在の盤面状態
 * @param {number} color - CPUの色（`BLACK` または `WHITE`）
 * @param {number} boardSize - 盤面サイズ
 * @param {{ run: (inputData: Float32Array) => Promise<{ policyLogits: Float32Array | number[], value: number }> }} session -
 *   `model-loader.js` の `loadModelSession` が返すセッションラッパー。テストではダックタイピングで
 *   モック可能（このモジュール自体は `onnxruntime-web` に一切依存しないため、Node標準テストで
 *   このままユニットテストできる）。
 * @returns {Promise<[number, number, number] | null>} 選んだ着手座標。合法手がなければ `null`
 */
export const chooseGanMove = async (board, color, boardSize, session) => {
  const legalMoves = getValidMoves(board, color, boardSize);
  if (legalMoves.length === 0) return null;

  const inputData = encodeBoardForModel(board, color, boardSize);
  const { policyLogits } = await session.run(inputData);

  const probabilities = computeLegalMovePolicy(policyLogits, legalMoves, boardSize);
  const index = sampleMoveIndex(probabilities);
  return legalMoves[index];
};
