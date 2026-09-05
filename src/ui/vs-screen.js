import { BLACK, WHITE } from '../logic/board.js';
import { getTier } from '../net/rating.js';
import { createTierIcon } from './tier-icon.js';
import { playClickSound } from '../audio/click-sound.js';

const COLOR_LABELS = { [BLACK]: '先手（黒）', [WHITE]: '後手（白）' };

/** この時間が経つと「対局開始」ボタンを押さなくても自動的に対局が始まる。 */
const AUTO_START_DELAY_MS = 5_000;

/**
 * 対戦者1名分の行（色ラベル・階級アイコン付きの名前・スコア）を組み立てる。
 * @param {number} color - `BLACK`/`WHITE`
 * @param {{ name: string, score: number } | null} profile - プロフィール取得に
 *   失敗した場合は`null`（対局自体は進められるよう、その場合も行は表示する）
 * @returns {HTMLElement}
 */
const buildPlayerRow = (color, profile) => {
  const row = document.createElement('div');
  row.className = 'vs-screen-row';

  const colorLabel = document.createElement('p');
  colorLabel.className = 'vs-screen-color-label';
  colorLabel.textContent = COLOR_LABELS[color];
  row.appendChild(colorLabel);

  const nameLine = document.createElement('p');
  nameLine.className = 'vs-screen-name-line';
  if (profile) {
    nameLine.appendChild(createTierIcon(profile.score));
    const nameText = document.createElement('span');
    nameText.textContent = profile.name;
    nameLine.appendChild(nameText);
  } else {
    nameLine.textContent = '（取得できませんでした）';
  }
  row.appendChild(nameLine);

  if (profile) {
    const scoreLine = document.createElement('p');
    scoreLine.className = 'vs-screen-score-line';
    scoreLine.textContent = `${profile.score}（${getTier(profile.score)}）`;
    row.appendChild(scoreLine);
  }

  return row;
};

/**
 * ランダムマッチング成立時に、対局開始前に挟む対戦カード画面を生成する。
 * 先手（黒）を上、後手（白）を下に表示する
 * （[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)参照）。
 * @param {HTMLElement} container - 追加先要素
 * @param {{ black: object | null, white: object | null, onStart: () => void }} params -
 *   `black`/`white`は`getPlayerProfile`の返り値（取得失敗時は`null`）。`onStart`は
 *   「対局開始」ボタン押下後、この画面の破棄が終わってから呼ばれる
 * @returns {{ dispose: () => void }}
 */
export const createVsScreen = (container, { black, white, onStart }) => {
  const overlay = document.createElement('div');
  overlay.className = 'vs-screen';

  const title = document.createElement('h1');
  title.textContent = 'マッチ成立！';
  overlay.appendChild(title);

  overlay.appendChild(buildPlayerRow(BLACK, black));

  const vsMark = document.createElement('p');
  vsMark.className = 'vs-screen-vs-mark';
  vsMark.textContent = 'VS';
  overlay.appendChild(vsMark);

  overlay.appendChild(buildPlayerRow(WHITE, white));

  const countdownLine = document.createElement('p');
  countdownLine.className = 'vs-screen-countdown';
  overlay.appendChild(countdownLine);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '対局開始';
  button.addEventListener('click', () => {
    playClickSound();
    start();
  });
  overlay.appendChild(button);

  container.appendChild(overlay);

  const start = () => {
    clearInterval(intervalId);
    dispose();
    onStart();
  };

  // ボタンを押さなくても、一定時間で自動的に対局を開始する
  // （[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)参照）。
  // 待ちたくない場合は引き続きボタンで即座に開始できる。
  let remainingSeconds = Math.ceil(AUTO_START_DELAY_MS / 1000);
  const renderCountdown = () => {
    countdownLine.textContent = `${remainingSeconds}秒後に自動的に対局が始まります`;
  };
  renderCountdown();

  const intervalId = setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      start();
      return;
    }
    renderCountdown();
  }, 1000);

  const dispose = () => {
    clearInterval(intervalId);
    overlay.remove();
  };

  return { dispose };
};
