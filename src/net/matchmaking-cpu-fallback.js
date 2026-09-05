/**
 * ランダムマッチングが一定時間成立しなかった場合の、CPU代替対戦への切り替え。
 * 自分の現在の階級に応じたCPUレベルを選ぶ純粋関数のみを置く（`rating.js`と同じ
 * 位置づけ。[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)参照）。
 * 実際の対局・精算は`src/main.js`・`src/net/rating-settlement.js`側の責務とする。
 */

import { getTierInfo } from './rating.js';

/** この時間、対戦相手が見つからなかった場合にCPU対戦へ切り替える。 */
export const FALLBACK_WAIT_MS = 60_000;

/** 階級（`rating.js`の`id`）ごとの代替CPUレベル。上位2階級は最強レベルを共有する。 */
const CPU_LEVEL_BY_TIER_ID = {
  iron: 1,
  aluminum: 2,
  bronze: 3,
  silver: 4,
  diamond: 5,
  'carbon-nanotube': 5,
};

/**
 * CPUレベルごとの「みなしレーティング」。Elo計算上の相手スコアとして使う
 * （対応する階級の下限値を採用。「そのCPUはこの階級に到達したばかりの
 * プレイヤー相当」という位置づけ）。
 */
const NOTIONAL_RATING_BY_CPU_LEVEL = {
  1: 1500,
  2: 1600,
  3: 1700,
  4: 1800,
  5: 2000,
};

/**
 * 現在のスコアから、代替対戦相手とするCPUのレベルを求める。
 * @param {number} score - 現在のスコア
 * @returns {number} CPUレベル（1〜5）
 */
export const getFallbackCpuLevel = (score) => CPU_LEVEL_BY_TIER_ID[getTierInfo(score).id];

/**
 * CPUレベルから、Elo計算に使うみなしレーティングを求める。
 * @param {number} cpuLevel - CPUレベル（1〜5）
 * @returns {number} みなしレーティング
 */
export const getFallbackCpuNotionalRating = (cpuLevel) => NOTIONAL_RATING_BY_CPU_LEVEL[cpuLevel];
