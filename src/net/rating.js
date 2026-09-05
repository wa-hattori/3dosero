/**
 * Eloライクなスコア計算・階級判定。Capacitor/Firebaseへの依存を持たない純粋関数のみを
 * 置く（[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)参照）。
 */

/** プレイヤーの初期スコア。 */
export const DEFAULT_SCORE = 1500;

/** スコア変動の基準値（標準的なEloレーティングのKファクター）。 */
export const K_FACTOR = 32;

/**
 * 1試合で動きうるスコアの最大変動幅。数学的に`K_FACTOR`が上限になる
 * （`expectedScore`は常に0と1の間の値を取るため、`|result - expected|`は1未満）。
 * Firestoreルール側の範囲チェックと同じ値を使う
 * （[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)の
 * 「Firestoreセキュリティルール」節参照）。
 */
export const MAX_SCORE_DELTA = K_FACTOR;

/** 対局結果。オセロは引き分けがあるため`DRAW`も持つ。 */
export const MATCH_RESULT = { WIN: 1, DRAW: 0.5, LOSS: 0 };

/** プレイヤー名として許可する最大文字数。 */
export const MAX_NAME_LENGTH = 20;

/**
 * 階級の閾値（この値未満なら1つ下の階級）・表示名・アイコンに使う元素記号。
 * スコアの低い順に並べる。`id`はCSSクラス名・アイコンのバリアント指定に使う
 * 安定した識別子（表示名の日本語はCSSクラス名に使いにくいため分離する）。
 * `DEFAULT_SCORE`(1500)は最初の階級（アイアン）に入る。
 */
const TIERS = [
  { threshold: 1600, id: 'iron', label: 'アイアン', symbol: 'Fe' },
  { threshold: 1700, id: 'aluminum', label: 'アルミ', symbol: 'Al' },
  { threshold: 1800, id: 'bronze', label: 'ブロンズ', symbol: 'Cu' },
  { threshold: 2000, id: 'silver', label: 'シルバー', symbol: 'Ag' },
  { threshold: 3000, id: 'diamond', label: 'ダイヤ', symbol: 'C' },
  { threshold: Infinity, id: 'carbon-nanotube', label: 'カーボンナノチューブ', symbol: 'C' },
];

/**
 * 自分が勝つ確率の期待値を求める（標準的なEloレーティングの式）。
 * @param {number} myScore - 自分の現在のスコア
 * @param {number} opponentScore - 対戦相手の現在のスコア
 * @returns {number} 0〜1の期待勝率
 */
export const expectedScore = (myScore, opponentScore) =>
  1 / (1 + 10 ** ((opponentScore - myScore) / 400));

/**
 * 対局結果に応じたスコアの増減量を求める。格上に勝つと増分が大きく、
 * 格下に負けると減少が大きい（標準的なEloレーティングの性質そのもの）。
 * @param {number} myScore - 自分の対局開始時点のスコア
 * @param {number} opponentScore - 相手の対局開始時点のスコア
 * @param {number} result - `MATCH_RESULT`のいずれか（1=勝ち, 0.5=引き分け, 0=負け）
 * @returns {number} スコアの増減量（負の値もありうる）。整数に丸める
 */
export const calculateEloDelta = (myScore, opponentScore, result) => {
  const expected = expectedScore(myScore, opponentScore);
  return Math.round(K_FACTOR * (result - expected));
};

/**
 * スコアから階級情報（表示名・アイコン用の識別子・元素記号）を求める。階級は
 * Firestoreに保存せず、常にこの関数でスコアから導出する（保存された階級と
 * スコアが食い違う事態を避けるため）。
 * @param {number} score - 現在のスコア
 * @returns {{ threshold: number, id: string, label: string, symbol: string }} 階級情報
 */
export const getTierInfo = (score) => TIERS.find((tier) => score < tier.threshold);

/**
 * スコアから階級の表示名だけを求める（`getTierInfo(score).label`の簡易版）。
 * @param {number} score - 現在のスコア
 * @returns {string} 階級の表示名
 */
export const getTier = (score) => getTierInfo(score).label;
