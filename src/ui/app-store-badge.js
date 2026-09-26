const APP_STORE_URL =
  'https://apps.apple.com/us/app/%E4%B8%89%E6%AC%A1%E5%85%83%E3%82%AA%E3%82%BB%E3%83%AD/id6807068194';

/**
 * Web版からiOSアプリ（App Store）の存在に気づいてもらうためのリンクバッジを表示する。
 * @param {HTMLElement} container - 追加先要素
 * @returns {{ dispose: () => void }}
 */
export const createAppStoreBadge = (container) => {
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
