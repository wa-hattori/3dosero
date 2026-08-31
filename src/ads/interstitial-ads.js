/**
 * インタースティシャル広告の表示（Capacitor/AdMob）。iOSネイティブシェル実行時のみ
 * 動作し、Web版では何もしない（[ios-ads](../../.claude/skills/ios-ads/SKILL.md)参照）。
 *
 * `@capacitor-community/admob`は関数内で動的importする。Web版では`isNativeIOS()`が
 * 常に`false`を返すためこの行に到達せず、広告関連のCDNモジュールが一切フェッチ
 * されない。非同期I/O・Capacitor/AdMob SDKへの依存を持つため自動テスト対象外
 * （[testing](../../.claude/rules/common/testing.md)の方針、`src/net/room-sync.js`と同じ扱い）。
 */

import { INTERSTITIAL_AD_UNIT_ID } from './ad-config.js';
import { shouldShowInterstitial } from './ad-frequency.js';

let gamesCompletedThisSession = 0;
let admobInitialized = false;

/**
 * iOSのCapacitorネイティブシェル上で実行されているかどうかを判定する。
 * `window.Capacitor`はネイティブシェル内でのみ自動的に注入されるグローバルなので、
 * Web版では常に`false`を返す。
 * @returns {boolean} iOSネイティブシェル上での実行なら`true`
 */
const isNativeIOS = () =>
  typeof window !== 'undefined' &&
  window.Capacitor?.isNativePlatform?.() === true &&
  window.Capacitor?.getPlatform?.() === 'ios';

/**
 * 対局が1つ終了したことを通知する。Web版では何もしない。iOS版では、
 * `AD_INTERSTITIAL_FREQUENCY`局に1回の頻度でインタースティシャル広告を表示する。
 * 広告の初期化（ATT許可・UMP同意フローを含む）は初回のみ行う。
 * @returns {Promise<void>}
 */
export const notifyGameEnded = async () => {
  if (!isNativeIOS()) return;

  gamesCompletedThisSession += 1;
  if (!shouldShowInterstitial(gamesCompletedThisSession)) return;

  try {
    const { AdMob } = await import('@capacitor-community/admob');

    if (!admobInitialized) {
      // ATT許可ダイアログ・UMP同意フォーム（EEA/UK/スイス向け）はここでハンドリングされる。
      await AdMob.initialize();
      admobInitialized = true;
    }

    await AdMob.prepareInterstitial({ adId: INTERSTITIAL_AD_UNIT_ID });
    await AdMob.showInterstitial();
  } catch (error) {
    // 広告の表示失敗はゲーム体験を妨げるべきではないため、握りつぶして続行する。
    console.error('インタースティシャル広告の表示に失敗しました', error);
  }
};
