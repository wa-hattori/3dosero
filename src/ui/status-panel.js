import { BLACK, WHITE } from '../logic/board.js';

const COLOR_LABELS = { [BLACK]: '黒', [WHITE]: '白' };

/**
 * 現在の手番・パス・ゲーム終了/勝敗を表示するDOMオーバーレイを生成する。
 * @param {HTMLElement} container - オーバーレイの追加先要素
 * @returns {{
 *   update: (state: {
 *     currentTurn: number,
 *     passedColor: number | null,
 *     isOver: boolean,
 *     winner: number | null,
 *   }) => void,
 * }}
 */
export const createStatusPanel = (container) => {
  const panel = document.createElement('div');
  panel.className = 'status-panel';
  container.appendChild(panel);

  /**
   * 表示内容を更新する。
   * @param {{currentTurn: number, passedColor: number | null, isOver: boolean, winner: number | null}} state
   */
  const update = ({ currentTurn, passedColor, isOver, winner }) => {
    if (isOver) {
      panel.textContent = winner === null
        ? 'ゲーム終了：引き分け'
        : `ゲーム終了：${COLOR_LABELS[winner]}の勝ち`;
      return;
    }

    const passNotice = passedColor === null ? '' : `（${COLOR_LABELS[passedColor]}はパス）`;
    panel.textContent = `手番：${COLOR_LABELS[currentTurn]}${passNotice}（すばやく2回タップ/クリックで着手）`;
  };

  return { update };
};
