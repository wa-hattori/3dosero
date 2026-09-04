/**
 * 【一時的な調査用コード】広告が表示されない原因をXcodeコンソールなしで特定するための
 * 画面上デバッグログ。原因が判明したら`interstitial-ads.js`とあわせて必ず削除すること。
 * 恒久的にコミットする種類のモジュールではない。
 */

let panel = null;

/**
 * 画面上に短い行を積み上げて表示する。実機でXcodeコンソールを見られない状況での
 * 一時的な代替手段。
 * @param {string} line - 表示する1行
 */
export const debugLog = (line) => {
  if (typeof document === 'undefined') return;

  if (panel === null) {
    panel = document.createElement('pre');
    panel.style.cssText = [
      'position: fixed',
      'top: 120px',
      'left: 8px',
      'right: 8px',
      'max-height: 60vh',
      'overflow-y: auto',
      'z-index: 9999',
      'margin: 0',
      'padding: 8px',
      'background: rgba(0, 0, 0, 0.85)',
      'color: #0f0',
      'font-size: 10px',
      'white-space: pre-wrap',
      'word-break: break-all',
      'pointer-events: none',
    ].join(';');
    document.body.appendChild(panel);
  }

  const time = new Date().toISOString().slice(11, 23);
  panel.textContent += `[${time}] ${line}\n`;
};
