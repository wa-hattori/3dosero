import { BOARD_SIZE } from '../logic/board.js';

/** スライダーがこの値のとき「全層表示」を意味する（0〜BOARD_SIZE-1は個別の層）。 */
const ALL_LAYERS_VALUE = BOARD_SIZE;

/**
 * 表示する層を選ぶスライダーを生成する。全層表示⇔特定の1層表示を切り替える。
 * @param {HTMLElement} container - コントロールの追加先要素
 * @param {(activeLayer: number | null) => void} onChange - 選択が変わるたびに呼ばれる
 * @returns {{ dispose: () => void }}
 */
export const createLayerControl = (container, onChange) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'layer-control';

  const label = document.createElement('span');
  label.textContent = '全層';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(ALL_LAYERS_VALUE);
  slider.value = String(ALL_LAYERS_VALUE);

  const handleInput = () => {
    const value = Number(slider.value);
    const activeLayer = value === ALL_LAYERS_VALUE ? null : value;
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
