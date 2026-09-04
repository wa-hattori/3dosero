/**
 * AdMobの広告ユニットID設定。
 *
 * AdMobアカウント作成前・実際の広告ユニットID発行前は、Googleが公式に配布している
 * テスト用ID（実際の広告を消費しない安全な値）を使う。**本番申請前に必ず実際の
 * 広告ユニットIDへ差し替えること**（[ios-ads](../../.claude/skills/ios-ads/SKILL.md)参照）。
 *
 * `src/net/firebase-config.js`と同じく、この値自体は機密情報ではない
 * （広告ユニットIDはクライアント側コードに埋め込まれる前提の識別子）ため、
 * `.gitignore`はしない。
 */

/** Googleが公式に配布している、iOSインタースティシャル広告のテスト用広告ユニットID。 */
const TEST_INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-3940256099942544/4411468910';

/**
 * 実際の広告ユニットID（AdMobアプリ「三次元オセロ」のインタースティシャル広告ユニット）。
 * AdMob App ID（`ios-app/ios/App/App/Info.plist`の`GADApplicationIdentifier`）と
 * publisher部分（`ca-app-pub-`直後の数字列）が一致していることを確認済み。
 */
const REAL_INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-1563615704897514/3825060860';

// 【一時的な調査用】実機で prepareInterstitial() が「Loading failed」で失敗する原因が
// コード側かAdMob側（広告在庫・アカウントの準備状況）かを切り分けるため、一時的に
// テスト用IDへ差し替えて検証する。原因判明後は必ず`REAL_INTERSTITIAL_AD_UNIT_ID`に戻すこと。
export const INTERSTITIAL_AD_UNIT_ID = TEST_INTERSTITIAL_AD_UNIT_ID;

/**
 * まだテスト用IDのままかどうかを判定する。本番ビルド前の確認・警告表示に使う。
 * @returns {boolean} テスト用IDのままなら`true`
 */
export const isUsingTestAdUnitId = () => INTERSTITIAL_AD_UNIT_ID === TEST_INTERSTITIAL_AD_UNIT_ID;
