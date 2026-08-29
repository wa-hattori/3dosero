import { SUPPORTED_BOARD_SIZES } from '../logic/board.js';

const BATTLE_MODES = [
  { id: 'cpu', label: 'CPU対戦' },
  { id: 'local', label: '2人対戦' },
  { id: 'online', label: 'オンライン対戦', disabled: true },
];

/**
 * 対局開始前に表示する、対戦モード→盤面サイズの2段階選択画面を生成する。
 * 選択が完了すると自身をDOMから取り除き、`onStart` を呼ぶ。
 * @param {HTMLElement} container - 追加先要素
 * @param {(selection: { battleMode: string, boardSize: number }) => void} onStart - 選択完了時に呼ばれる
 * @returns {{ dispose: () => void }}
 */
export const createStartScreen = (container, onStart) => {
  const overlay = document.createElement('div');
  overlay.className = 'start-screen';

  const title = document.createElement('h1');
  title.textContent = '高次元オセロ';
  overlay.appendChild(title);

  const subtitle = document.createElement('p');
  overlay.appendChild(subtitle);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'start-screen-modes';
  overlay.appendChild(buttonRow);

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'start-screen-back';
  backButton.textContent = '← モード選択に戻る';
  backButton.hidden = true;
  overlay.appendChild(backButton);

  let selectedBattleMode = null;

  const dispose = () => {
    overlay.remove();
  };

  const clearButtons = () => {
    buttonRow.replaceChildren();
  };

  const showBoardSizeStep = () => {
    subtitle.textContent = '盤面サイズを選んでください';
    backButton.hidden = false;
    clearButtons();

    for (const boardSize of SUPPORTED_BOARD_SIZES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${boardSize}×${boardSize}×${boardSize}`;
      button.addEventListener('click', () => {
        dispose();
        onStart({ battleMode: selectedBattleMode, boardSize });
      });
      buttonRow.appendChild(button);
    }
  };

  const showBattleModeStep = () => {
    subtitle.textContent = '対戦モードを選んでください';
    backButton.hidden = true;
    clearButtons();

    for (const mode of BATTLE_MODES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = mode.disabled ? `${mode.label}（近日公開）` : mode.label;
      button.disabled = Boolean(mode.disabled);
      button.addEventListener('click', () => {
        selectedBattleMode = mode.id;
        showBoardSizeStep();
      });
      buttonRow.appendChild(button);
    }
  };

  backButton.addEventListener('click', () => {
    selectedBattleMode = null;
    showBattleModeStep();
  });

  showBattleModeStep();
  container.appendChild(overlay);

  return { dispose };
};
