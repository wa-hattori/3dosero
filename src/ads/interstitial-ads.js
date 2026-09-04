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
// 【一時的な調査用】広告が表示されない原因調査用(第2ラウンド: sessionStorage修正後も
// 表示されないため、その先のAdMob呼び出し自体を疑う)。原因判明後にこのimportと
// 下記の`debugLog(...)`呼び出しをすべて削除し、`debug-overlay.js`自体も削除すること。
import { debugLog } from './debug-overlay.js';

/**
 * 対局完了数を保持する`sessionStorage`のキー。「タイトルに戻る」ボタンが
 * `window.location.reload()`でページを再読み込みする設計（[end-screen](../ui/end-screen.js)
 * 参照）のため、メモリ上の変数だけでは新しい対局を始めるたびにカウントが0に
 * リセットされてしまい、`AD_INTERSTITIAL_FREQUENCY`局に到達することが永遠にない
 * （実機のTestFlightフィードバックで発見した不具合）。`sessionStorage`はページの
 * 再読み込みでは消えず、アプリの完全終了（タブ/ウィンドウを閉じる相当）で消えるため、
 * 「アプリ起動中は保持、再起動でリセット」という元々の意図通りの挙動になる。
 */
const SESSION_STORAGE_KEY = 'gamesCompletedThisSession';

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
 * 対局完了数をインクリメントして`sessionStorage`に書き戻し、更新後の値を返す。
 * プライベートブラウジング等で`sessionStorage`が使えない環境でも、広告表示を
 * 諦めるだけでゲーム自体は継続できるようにフォールバックする。
 * @returns {number} インクリメント後の対局完了数
 */
const incrementGamesCompletedThisSession = () => {
  try {
    const current = Number(sessionStorage.getItem(SESSION_STORAGE_KEY)) || 0;
    const next = current + 1;
    sessionStorage.setItem(SESSION_STORAGE_KEY, String(next));
    return next;
  } catch (error) {
    debugLog(`sessionStorage ERROR: ${error?.name}: ${error?.message}`);
    return 0;
  }
};

/**
 * 対局が1つ終了したことを通知する。Web版では何もしない。iOS版では、
 * `AD_INTERSTITIAL_FREQUENCY`局に1回の頻度でインタースティシャル広告を表示する。
 * 広告の初期化（ATT許可・UMP同意フローを含む）は初回のみ行う。
 * @returns {Promise<void>}
 */
export const notifyGameEnded = async () => {
  debugLog(`notifyGameEnded called. isNativeIOS=${isNativeIOS()}`);
  if (!isNativeIOS()) return;

  // sessionStorage自体が期待通り動いているか(reload後も値が保持されるか)を
  // 直接確認するためのプローブ。前回の値があれば表示してから、今回分をインクリメントする。
  let probeBefore = '(read failed)';
  try {
    probeBefore = sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch (error) {
    probeBefore = `(read threw: ${error?.message})`;
  }
  debugLog(`sessionStorage BEFORE increment: ${probeBefore}`);

  const gamesCompleted = incrementGamesCompletedThisSession();
  const shouldShow = shouldShowInterstitial(gamesCompleted);
  debugLog(`gamesCompleted=${gamesCompleted} shouldShow=${shouldShow}`);
  if (!shouldShow) return;

  try {
    debugLog('importing @capacitor-community/admob...');
    const { AdMob } = await import('@capacitor-community/admob');
    debugLog(`import OK. AdMob=${typeof AdMob}`);

    if (!admobInitialized) {
      debugLog('calling AdMob.initialize()...');
      // ATT許可ダイアログ・UMP同意フォーム（EEA/UK/スイス向け）はここでハンドリングされる。
      await AdMob.initialize();
      admobInitialized = true;
      debugLog('AdMob.initialize() OK');
    } else {
      debugLog('AdMob already initialized, skipping initialize()');
    }

    debugLog(`calling AdMob.prepareInterstitial({adId: ${INTERSTITIAL_AD_UNIT_ID}})...`);
    const prepareResult = await AdMob.prepareInterstitial({ adId: INTERSTITIAL_AD_UNIT_ID });
    debugLog(`prepareInterstitial() OK. result=${JSON.stringify(prepareResult)}`);

    debugLog('calling AdMob.showInterstitial()...');
    await AdMob.showInterstitial();
    debugLog('showInterstitial() OK (ad should be visible now)');
  } catch (error) {
    // 広告の表示失敗はゲーム体験を妨げるべきではないため、握りつぶして続行する。
    console.error('インタースティシャル広告の表示に失敗しました', error);
    debugLog(`ERROR name=${error?.name ?? '?'} code=${error?.code ?? '?'}`);
    debugLog(`ERROR message=${error?.message ?? String(error)}`);
  }
};
