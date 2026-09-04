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
// 【一時的な調査用・第3ラウンド】esm.sh切り替え後もまだ広告が出ないため、
// AdMob初期化〜表示までの各ステップを再度詳しく調査する。原因判明後にこのimportと
// 下記の`debugLog(...)`呼び出しをすべて削除し、`debug-overlay.js`自体も削除すること。
import { debugLog } from './debug-overlay.js';

const SESSION_STORAGE_KEY = 'gamesCompletedThisSession';

let admobInitialized = false;

const isNativeIOS = () =>
  typeof window !== 'undefined' &&
  window.Capacitor?.isNativePlatform?.() === true &&
  window.Capacitor?.getPlatform?.() === 'ios';

const incrementGamesCompletedThisSession = () => {
  try {
    const current = Number(sessionStorage.getItem(SESSION_STORAGE_KEY)) || 0;
    const next = current + 1;
    sessionStorage.setItem(SESSION_STORAGE_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
};

/**
 * エラーオブジェクトの自前挙動を可能な限り漏れなく文字列化する。AdMob/Capacitorの
 * エラーはプレーンな`Error`ではなくプラグイン独自の形（`{code, message}`のみで
 * `name`/`stack`を持たない等）のことがあるため、複数の手段を試す。
 * @param {unknown} error
 * @returns {string}
 */
const describeError = (error) => {
  try {
    const own = JSON.stringify(error, Object.getOwnPropertyNames(error ?? {}));
    return `own=${own}`;
  } catch {
    return `String(error)=${String(error)}`;
  }
};

export const notifyGameEnded = async () => {
  debugLog(`notifyGameEnded called. isNativeIOS=${isNativeIOS()}`);
  if (!isNativeIOS()) return;

  const gamesCompleted = incrementGamesCompletedThisSession();
  const shouldShow = shouldShowInterstitial(gamesCompleted);
  debugLog(`gamesCompleted=${gamesCompleted} shouldShow=${shouldShow}`);
  if (!shouldShow) return;

  try {
    debugLog('importing @capacitor-community/admob...');
    const admobModule = await import('@capacitor-community/admob');
    debugLog(`import OK. keys=${Object.keys(admobModule).join(',')}`);
    const { AdMob } = admobModule;
    debugLog(`AdMob=${typeof AdMob} methods=${AdMob ? Object.keys(AdMob).join(',') : '(none)'}`);

    if (!admobInitialized) {
      debugLog('calling AdMob.initialize()...');
      const initResult = await AdMob.initialize();
      admobInitialized = true;
      debugLog(`AdMob.initialize() OK. result=${JSON.stringify(initResult)}`);
    } else {
      debugLog('AdMob already initialized, skipping initialize()');
    }

    debugLog(`adUnitId=${INTERSTITIAL_AD_UNIT_ID}`);
    debugLog('calling AdMob.prepareInterstitial()...');
    const prepareResult = await AdMob.prepareInterstitial({ adId: INTERSTITIAL_AD_UNIT_ID });
    debugLog(`prepareInterstitial() OK. result=${JSON.stringify(prepareResult)}`);

    debugLog('calling AdMob.showInterstitial()...');
    const showResult = await AdMob.showInterstitial();
    debugLog(`showInterstitial() OK. result=${JSON.stringify(showResult)} (ad should be visible now)`);
  } catch (error) {
    console.error('インタースティシャル広告の表示に失敗しました', error);
    debugLog(`ERROR name=${error?.name ?? '?'} code=${error?.code ?? '?'}`);
    debugLog(`ERROR message=${error?.message ?? '(no message)'}`);
    debugLog(`ERROR ${describeError(error)}`);
  }
};
