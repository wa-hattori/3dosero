import { BLACK, WHITE } from '../logic/board.js';

const COLOR_LABELS = { [BLACK]: '黒', [WHITE]: '白' };
const PASS_FLASH_CLASS = 'status-panel--pass-flash';

/**
 * 現在の手番・パス・ゲーム終了/勝敗を表示するDOMオーバーレイを生成する。
 * @param {HTMLElement} container - オーバーレイの追加先要素
 * @returns {{
 *   update: (state: {
 *     currentTurn: number,
 *     passedColor: number | null,
 *     isOver: boolean,
 *     winner: number | null,
 *     isCpuTurn?: boolean,
 *   }) => void,
 * }}
 */
export const createStatusPanel = (container) => {
  const panel = document.createElement('div');
  panel.className = 'status-panel';
  container.appendChild(panel);

  /**
   * 表示内容を更新する。
   * @param {{
   *   currentTurn: number,
   *   passedColor: number | null,
   *   isOver: boolean,
   *   winner: number | null,
   *   isCpuTurn?: boolean,
   * }} state
   */
  const update = ({ currentTurn, passedColor, isOver, winner, isCpuTurn = false }) => {
    if (isOver) {
      panel.classList.remove(PASS_FLASH_CLASS);
      panel.textContent = winner === null
        ? 'ゲーム終了：引き分け'
        : `ゲーム終了：${COLOR_LABELS[winner]}の勝ち`;
      return;
    }

    const passNotice = passedColor === null ? '' : `（${COLOR_LABELS[passedColor]}はパス）`;
    const actionHint = isCpuTurn ? '（CPU思考中…）' : '（すばやく2回タップ/クリックで着手）';
    panel.textContent = `手番：${COLOR_LABELS[currentTurn]}${passNotice}${actionHint}`;

    // パス発生時のみ強調アニメーションを再生する。連続でパスが起きた場合も
    // 確実に再生されるよう、一度クラスを外してreflowを挟んでから付け直す。
    panel.classList.remove(PASS_FLASH_CLASS);
    if (passedColor !== null) {
      void panel.offsetWidth;
      panel.classList.add(PASS_FLASH_CLASS);
    }
  };

  return { update };
};
