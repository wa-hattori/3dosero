/**
 * インタースティシャル広告を表示すべきかどうかの判定。Capacitor/AdMobへの依存を
 * 持たない純粋関数のみを置く（[ios-ads](../../.claude/skills/ios-ads/SKILL.md)参照）。
 */

/**
 * 何局に1回インタースティシャル広告を表示するか。頻度を上げすぎると離脱・
 * アンインストールが増え、かえって生涯表示回数（＝収益）が下がりうるため、
 * 収益目的で安易に上げない（SKILL.md参照）。
 */
export const AD_INTERSTITIAL_FREQUENCY = 3;

/**
 * 今回の対局終了で広告を表示すべきかどうかを判定する。
 * @param {number} gamesCompletedCount - このセッション中に終了した対局数（1始まり）
 * @param {number} [frequency] - 何局に1回表示するか（省略時は`AD_INTERSTITIAL_FREQUENCY`）
 * @returns {boolean} 表示すべきなら`true`
 */
export const shouldShowInterstitial = (gamesCompletedCount, frequency = AD_INTERSTITIAL_FREQUENCY) =>
  gamesCompletedCount > 0 && gamesCompletedCount % frequency === 0;
