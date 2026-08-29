import { BLACK, WHITE } from '../logic/board.js';

const COLOR_LABELS = { [BLACK]: '黒', [WHITE]: '白' };

/**
 * ゲーム終了時に勝敗結果を表示し、「タイトルに戻る」ボタンでページを再読み込みする
 * 結果画面を生成する。Three.jsのリソース（Scene/Renderer/イベントリスナー）は
 * ページ再読み込みにより安全に一括破棄される（その場での再初期化は行わない）。
 * @param {HTMLElement} container - 追加先要素
 * @param {{ winner: number | null, counts: {[BLACK]: number, [WHITE]: number} }} result - 終了時の結果
 * @returns {{ dispose: () => void }}
 */
export const createEndScreen = (container, { winner, counts }) => {
  const overlay = document.createElement('div');
  overlay.className = 'end-screen';

  const title = document.createElement('h1');
  title.textContent = winner === null ? '引き分け' : `${COLOR_LABELS[winner]}の勝ち`;
  overlay.appendChild(title);

  const scoreLine = document.createElement('p');
  scoreLine.textContent = `黒 ${counts[BLACK]} － 白 ${counts[WHITE]}`;
  overlay.appendChild(scoreLine);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'タイトルに戻る';
  button.addEventListener('click', () => window.location.reload());
  overlay.appendChild(button);

  container.appendChild(overlay);

  const dispose = () => {
    overlay.remove();
  };

  return { dispose };
};
