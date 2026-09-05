import { getTierInfo } from '../net/rating.js';

/**
 * スコアに応じた階級アイコン（コイン型、中央に元素記号）のDOM要素を作る。
 * 画像アセットは使わず、色は`index.html`側のCSS（`.tier-icon--<id>`）で
 * 階級ごとに塗り分ける（[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)の
 * 「階級アイコン」節参照）。
 * @param {number} score - プレイヤーの現在のスコア
 * @returns {HTMLElement} `<span class="tier-icon tier-icon--<id>">`要素（元素記号を表示）
 */
export const createTierIcon = (score) => {
  const { id, label, symbol } = getTierInfo(score);

  const icon = document.createElement('span');
  icon.className = `tier-icon tier-icon--${id}`;
  icon.textContent = symbol;
  icon.title = label;
  icon.setAttribute('aria-label', label);
  return icon;
};
