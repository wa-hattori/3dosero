import { SUPPORTED_BOARD_SIZES } from '../logic/board.js';
import { RANDOM_CPU_LEVEL, MAX_CPU_LEVEL } from '../logic/cpu.js';
import { playClickSound } from '../audio/click-sound.js';

const BATTLE_MODES = [
  { id: 'cpu', label: 'CPU対戦' },
  { id: 'local', label: '2人対戦' },
  { id: 'online', label: 'オンライン対戦', disabled: true },
];

/**
 * CPU対戦の難易度レベルの表示ラベルを組み立てる。レベル1は既存のランダムCPU、
 * 最大レベルはGAN CPUモデルの最上位という位置づけを示すヒントを添える。
 * @param {number} level - CPUレベル（`RANDOM_CPU_LEVEL`〜`MAX_CPU_LEVEL`）
 * @returns {string} ボタンに表示するラベル
 */
const cpuLevelLabel = (level) => {
  if (level === RANDOM_CPU_LEVEL) return `レベル${level}（ランダム）`;
  if (level === MAX_CPU_LEVEL) return `レベル${level}（最強）`;
  return `レベル${level}`;
};

/**
 * 対局開始前に表示する、対戦モード→盤面サイズ→（CPU対戦のみ）難易度の選択画面を生成する。
 * 選択が完了すると自身をDOMから取り除き、`onStart` を呼ぶ。
 * @param {HTMLElement} container - 追加先要素
 * @param {(selection: { battleMode: string, boardSize: number, cpuLevel: number | null }) => void} onStart -
 *   選択完了時に呼ばれる。`cpuLevel` はCPU対戦モード以外では `null`
 * @param {() => void} [onFirstInteraction] - モード選択ボタンの最初のクリック時に呼ばれる。
 *   `<audio>.play()`はブラウザの自動再生ポリシー上、ボタン自身のクリックハンドラ内など
 *   ユーザー操作に直接応答する形で同期的に呼ばれた場合に最も確実に許可される
 *   （`document`への委譲リスナー経由だと、環境によっては許可されないことがある）ため、
 *   スタート画面BGMの起動はこのコールバック経由でボタンのハンドラ内から直接行うこと。
 * @returns {{ dispose: () => void }}
 */
export const createStartScreen = (container, onStart, onFirstInteraction) => {
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
  let selectedBoardSize = null;
  // 「戻る」ボタンは1つ前のステップに戻す必要があるため、現在のステップを覚えておく。
  let currentStep = 'mode';

  const dispose = () => {
    overlay.remove();
  };

  const clearButtons = () => {
    buttonRow.replaceChildren();
  };

  const finishSelection = (cpuLevel) => {
    dispose();
    onStart({ battleMode: selectedBattleMode, boardSize: selectedBoardSize, cpuLevel });
  };

  const showCpuLevelStep = () => {
    subtitle.textContent = '難易度を選んでください';
    backButton.hidden = false;
    backButton.textContent = '← 盤面サイズ選択に戻る';
    currentStep = 'cpuLevel';
    clearButtons();

    for (let level = RANDOM_CPU_LEVEL; level <= MAX_CPU_LEVEL; level += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = cpuLevelLabel(level);
      button.addEventListener('click', () => {
        playClickSound();
        finishSelection(level);
      });
      buttonRow.appendChild(button);
    }
  };

  const showBoardSizeStep = () => {
    subtitle.textContent = '盤面サイズを選んでください';
    backButton.hidden = false;
    backButton.textContent = '← モード選択に戻る';
    currentStep = 'boardSize';
    clearButtons();

    for (const boardSize of SUPPORTED_BOARD_SIZES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${boardSize}×${boardSize}×${boardSize}`;
      button.addEventListener('click', () => {
        playClickSound();
        selectedBoardSize = boardSize;
        if (selectedBattleMode === 'cpu') {
          showCpuLevelStep();
          return;
        }
        finishSelection(null);
      });
      buttonRow.appendChild(button);
    }
  };

  const showBattleModeStep = () => {
    subtitle.textContent = '対戦モードを選んでください';
    backButton.hidden = true;
    currentStep = 'mode';
    clearButtons();

    for (const mode of BATTLE_MODES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = mode.disabled ? `${mode.label}（近日公開）` : mode.label;
      button.disabled = Boolean(mode.disabled);
      button.addEventListener('click', () => {
        onFirstInteraction?.();
        playClickSound();
        selectedBattleMode = mode.id;
        showBoardSizeStep();
      });
      buttonRow.appendChild(button);
    }
  };

  backButton.addEventListener('click', () => {
    playClickSound();
    if (currentStep === 'cpuLevel') {
      showBoardSizeStep();
      return;
    }
    selectedBattleMode = null;
    selectedBoardSize = null;
    showBattleModeStep();
  });

  showBattleModeStep();
  container.appendChild(overlay);

  return { dispose };
};
