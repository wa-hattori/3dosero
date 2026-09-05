import { playClickSound } from '../audio/click-sound.js';

/**
 * 対局画面からタイトル（スタート画面）に戻るボタンを生成する。
 * その場での再初期化はせず、確認ダイアログの後にページを再読み込みする
 * ことで、Three.jsのリソース（Scene/Renderer/イベントリスナー）を
 * 安全に一括破棄する（[end-screen](./end-screen.js) と同じ方針）。
 * @param {HTMLElement} container - 追加先要素
 * @param {{ onBeforeLeave?: () => Promise<void> | void }} [options] - `onBeforeLeave`は
 *   離脱が確定した後・ページ再読み込みの直前に呼ばれる（オンライン対戦での対局放棄通知
 *   など、離脱前に済ませておきたい非同期処理のためのフック）。失敗してもタイトルへの
 *   帰還自体は妨げない。
 * @returns {{ dispose: () => void }}
 */
export const createTitleButton = (container, { onBeforeLeave } = {}) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'title-button';
  button.textContent = '← タイトルに戻る';

  const handleClick = async () => {
    const confirmed = window.confirm('タイトルに戻りますか？ 現在の対局は失われます。');
    if (!confirmed) return;
    playClickSound();
    if (onBeforeLeave) {
      try {
        await onBeforeLeave();
      } catch (error) {
        // 通知に失敗しても、タイトルに戻る操作自体は妨げない。
        console.error('離脱前の処理に失敗しました', error);
      }
    }
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
