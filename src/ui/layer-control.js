import { BOARD_SIZE } from '../logic/board.js';

/**
 * 表示する層を選ぶスライダーを生成する。全層表示⇔特定の1層表示を切り替える。
 * スライダーが `boardSize`（＝最大値）のとき「全層表示」を意味する（0〜boardSize-1は個別の層）。
 * @param {HTMLElement} container - コントロールの追加先要素
 * @param {(activeLayer: number | null) => void} onChange - 選択が変わるたびに呼ばれる
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {{ dispose: () => void }}
 */
export const createLayerControl = (container, onChange, boardSize = BOARD_SIZE) => {
  const allLayersValue = boardSize;

  const wrapper = document.createElement('div');
  wrapper.className = 'layer-control';

  const label = document.createElement('span');
  label.textContent = '全層';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(allLayersValue);
  slider.value = String(allLayersValue);

  const handleInput = () => {
    const value = Number(slider.value);
    const activeLayer = value === allLayersValue ? null : value;
    label.textContent = activeLayer === null ? '全層' : `層 ${activeLayer}`;
    onChange(activeLayer);
  };

  slider.addEventListener('input', handleInput);

  wrapper.append(label, slider);
  container.appendChild(wrapper);

  const dispose = () => {
    slider.removeEventListener('input', handleInput);
  };

  return { dispose };
};
