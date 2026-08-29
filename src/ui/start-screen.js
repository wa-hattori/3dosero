import { SUPPORTED_BOARD_SIZES } from '../logic/board.js';

/**
 * 対局開始前に表示する、盤面サイズ（モード）選択画面を生成する。
 * ボタンが選ばれたら自身をDOMから取り除き、`onSelectSize` を呼ぶ。
 * @param {HTMLElement} container - 追加先要素
 * @param {(boardSize: number) => void} onSelectSize - モード選択時に呼ばれる
 * @returns {{ dispose: () => void }}
 */
export const createStartScreen = (container, onSelectSize) => {
  const overlay = document.createElement('div');
  overlay.className = 'start-screen';

  const title = document.createElement('h1');
  title.textContent = '3dosero';
  overlay.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.textContent = 'モードを選んでください';
  overlay.appendChild(subtitle);

  const modeRow = document.createElement('div');
  modeRow.className = 'start-screen-modes';

  const dispose = () => {
    overlay.remove();
  };

  const handleSelect = (boardSize) => {
    dispose();
    onSelectSize(boardSize);
  };

  for (const boardSize of SUPPORTED_BOARD_SIZES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${boardSize}×${boardSize}×${boardSize}`;
    button.addEventListener('click', () => handleSelect(boardSize));
    modeRow.appendChild(button);
  }

  overlay.appendChild(modeRow);
  container.appendChild(overlay);

  return { dispose };
};
