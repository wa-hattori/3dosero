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

/** 階級の閾値（この値未満なら1つ下の階級）と表示名。スコアの低い順に並べる。 */
const TIERS = [
  { threshold: 1300, label: 'ブロンズ' },
  { threshold: 1500, label: 'シルバー' },
  { threshold: 1700, label: 'ゴールド' },
  { threshold: 1900, label: 'プラチナ' },
  { threshold: Infinity, label: 'ダイヤモンド' },
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
 * スコアから階級の表示名を求める。階級はFirestoreに保存せず、常にこの関数で
 * スコアから導出する（保存された階級とスコアが食い違う事態を避けるため）。
 * @param {number} score - 現在のスコア
 * @returns {string} 階級の表示名
 */
export const getTier = (score) => TIERS.find((tier) => score < tier.threshold).label;
