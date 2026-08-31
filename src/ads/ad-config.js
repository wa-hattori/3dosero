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

/** 実際の広告ユニットID。AdMobでアプリを登録した後、ここを差し替える。 */
export const INTERSTITIAL_AD_UNIT_ID = TEST_INTERSTITIAL_AD_UNIT_ID;

/**
 * まだテスト用IDのままかどうかを判定する。本番ビルド前の確認・警告表示に使う。
 * @returns {boolean} テスト用IDのままなら`true`
 */
export const isUsingTestAdUnitId = () => INTERSTITIAL_AD_UNIT_ID === TEST_INTERSTITIAL_AD_UNIT_ID;
