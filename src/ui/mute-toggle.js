/**
 * BGMのミュート切り替えボタンを生成する。スタート画面・対局画面を通じて
 * 常時表示される想定で、1回だけ生成して呼び出し側で保持する。
 * @param {HTMLElement} container - 追加先要素
 * @param {(muted: boolean) => void} onToggle - ミュート状態が変わるたびに呼ばれる
 * @returns {{ dispose: () => void }}
 */
export const createMuteToggle = (container, onToggle) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mute-toggle';
  button.textContent = '🔊';
  button.setAttribute('aria-label', 'BGMのミュート切り替え');

  let muted = false;

  const handleClick = () => {
    muted = !muted;
    button.textContent = muted ? '🔇' : '🔊';
    onToggle(muted);
  };

  button.addEventListener('click', handleClick);
  container.appendChild(button);

  const dispose = () => {
    button.removeEventListener('click', handleClick);
    button.remove();
  };

  return { dispose };
};
