import { getTier } from '../net/rating.js';
import { createTierIcon } from './tier-icon.js';
import { playClickSound } from '../audio/click-sound.js';

/**
 * レート戦（ランダムマッチング）の対局結果によるスコア変動を可視化する画面を
 * 生成する。end-screenの「タイトルに戻る」の続きとして挟むことを想定しており、
 * このボタン自体がページ再読み込みを行う
 * （[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)参照）。
 * @param {HTMLElement} container - 追加先要素
 * @param {{ beforeScore: number, afterScore: number, delta: number }} settlement -
 *   `settleRankedResult`の返り値
 * @returns {{ dispose: () => void }}
 */
export const createScoreChangeScreen = (container, { beforeScore, afterScore, delta }) => {
  const overlay = document.createElement('div');
  overlay.className = 'score-change-screen';

  const title = document.createElement('h1');
  title.textContent = 'レート変動';
  overlay.appendChild(title);

  const scoreLine = document.createElement('p');
  scoreLine.className = 'score-change-line';
  scoreLine.appendChild(createTierIcon(beforeScore));
  const scoreText = document.createElement('span');
  scoreText.textContent = `${beforeScore} → ${afterScore}`;
  scoreLine.appendChild(scoreText);
  scoreLine.appendChild(createTierIcon(afterScore));
  overlay.appendChild(scoreLine);

  const deltaLine = document.createElement('p');
  deltaLine.className =
    delta > 0
      ? 'score-change-delta score-change-delta--up'
      : delta < 0
        ? 'score-change-delta score-change-delta--down'
        : 'score-change-delta';
  deltaLine.textContent = delta > 0 ? `+${delta}` : `${delta}`;
  overlay.appendChild(deltaLine);

  const beforeTier = getTier(beforeScore);
  const afterTier = getTier(afterScore);
  if (beforeTier !== afterTier) {
    const tierChangeLine = document.createElement('p');
    tierChangeLine.textContent =
      afterScore > beforeScore ? `${afterTier}に昇格！` : `${afterTier}に降格`;
    overlay.appendChild(tierChangeLine);
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'タイトルに戻る';
  button.addEventListener('click', () => {
    playClickSound();
    window.location.reload();
  });
  overlay.appendChild(button);

  container.appendChild(overlay);

  const dispose = () => {
    overlay.remove();
  };

  return { dispose };
};
