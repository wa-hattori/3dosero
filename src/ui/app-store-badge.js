const APP_STORE_URL =
  'https://apps.apple.com/us/app/%E4%B8%89%E6%AC%A1%E5%85%83%E3%82%AA%E3%82%BB%E3%83%AD/id6807068194';

/**
 * iOSのCapacitorネイティブシェル上で実行されているかどうかを判定する。
 * `window.Capacitor`はネイティブシェル内でのみ自動的に注入されるグローバルなので、
 * Web版では常に`false`を返す（[interstitial-ads.js](../ads/interstitial-ads.js)と同じ判定）。
 * @returns {boolean} iOSネイティブシェル上での実行なら`true`
 */
const isNativeIOS = () =>
  typeof window !== 'undefined' &&
  window.Capacitor?.isNativePlatform?.() === true &&
  window.Capacitor?.getPlatform?.() === 'ios';

/**
 * Web版からiOSアプリ（App Store）の存在に気づいてもらうためのリンクバッジを表示する。
 * ネイティブiOSアプリ内（同じ`index.html`がオフライン同梱されている）では、
 * 既にインストール済みのアプリへのリンクを表示しても意味がないため何もしない。
 * @param {HTMLElement} container - 追加先要素
 * @returns {{ dispose: () => void }}
 */
export const createAppStoreBadge = (container) => {
  if (isNativeIOS()) {
    return { dispose: () => {} };
  }

  const badge = document.createElement('a');
  badge.className = 'app-store-badge';
  badge.href = APP_STORE_URL;
  badge.target = '_blank';
  badge.rel = 'noopener noreferrer';
  badge.textContent = '📱 iPhoneアプリもあります';
  container.appendChild(badge);

  const dispose = () => {
    badge.remove();
  };

  return { dispose };
};
