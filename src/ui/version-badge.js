/**
 * 現在のアプリバージョン（`package.json` の `version`）を表示するバッジを生成する。
 * ビルドステップなし方針のため、`package.json` をランタイムでfetchして取得する
 * （[release-tagging](../../.claude/skills/release-tagging/SKILL.md) 参照）。
 * 取得に失敗しても対局は止めず、バッジには何も表示しない。
 * @param {HTMLElement} container - 追加先要素
 * @returns {{ dispose: () => void }}
 */
export const createVersionBadge = (container) => {
  const badge = document.createElement('div');
  badge.className = 'version-badge';
  container.appendChild(badge);

  fetch('./package.json')
    .then((response) => response.json())
    .then((packageInfo) => {
      badge.textContent = `v${packageInfo.version}`;
    })
    .catch((error) => {
      console.error('バージョン情報の取得に失敗しました', error);
    });

  const dispose = () => {
    badge.remove();
  };

  return { dispose };
};
