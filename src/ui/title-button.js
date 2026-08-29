import { playClickSound } from '../audio/click-sound.js';

/**
 * 対局画面からタイトル（スタート画面）に戻るボタンを生成する。
 * その場での再初期化はせず、確認ダイアログの後にページを再読み込みする
 * ことで、Three.jsのリソース（Scene/Renderer/イベントリスナー）を
 * 安全に一括破棄する（[end-screen](./end-screen.js) と同じ方針）。
 * @param {HTMLElement} container - 追加先要素
 * @returns {{ dispose: () => void }}
 */
export const createTitleButton = (container) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'title-button';
  button.textContent = '← タイトルに戻る';

  const handleClick = () => {
    const confirmed = window.confirm('タイトルに戻りますか？ 現在の対局は失われます。');
    if (!confirmed) return;
    playClickSound();
    window.location.reload();
  };

  button.addEventListener('click', handleClick);
  container.appendChild(button);

  const dispose = () => {
    button.removeEventListener('click', handleClick);
    button.remove();
  };

  return { dispose };
};
