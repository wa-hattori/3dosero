---
name: ranked-matchmaking
description: ランダムマッチングにおけるプレイヤーネーム・Eloライクなスコア・階級・ランキング表示の正本。src/net/rating.js・players/{uid}コレクション関連の実装・レビュー時は必ずこれを参照し、独自に再導出しない。
---

# レーティング戦（ランダムマッチング）の正本

[online-multiplayer](../online-multiplayer/SKILL.md)のランダムマッチングの上に、勝敗でスコアが上下するレーティング制を追加する。**対象はランダムマッチングのみ**（ルームコード制の対局はスコアに影響しない）。

## スコープと前提

- プレイヤーネームの設定（重複許可、フィルタリングなし）。
- 勝敗によるEloライクなスコア増減（強者に勝つと増分が大きく、弱者に負けると減少が大きい）。
- スコアに応じた5階級表示。
- スコア上位者のランキング表示。
- **アカウント登録は導入しない。** スコアはFirebase Anonymous Authenticationの`uid`に紐づく。ブラウザ/アプリのデータ消去・別ブラウザ/別端末・iOSアプリの再インストールで実績が失われる制約を許容する（[online-multiplayer](../online-multiplayer/SKILL.md)の「認証」節と同じ前提）。**アプリを閉じるだけではリセットされない**（認証情報はローカルに永続化されるため）。

## 不正防止の方針（重要・既知の限界あり）

[online-multiplayer](../online-multiplayer/SKILL.md)の信頼境界（着手の合法性はクライアント検証、ルールは「誰が・いつ」のみ強制）と同じ思想を踏襲する。**Eloの数式そのものをFirestoreルール上で再現するのではなく、クライアント側の純粋関数で計算し、ルールは「1試合あたりの増減幅の上限」「既に精算済みの対局を再度申告できないようにする緩やかな仕組み」で範囲を絞る**という設計を選んだ（サーバーコード〈Cloud Functions等〉を書かない方針を維持するため。Elo計算式をルール言語で完全に再現する案も検討したが、複雑になりすぎ・テストが困難・チューニングのたびにルール再デプロイが必要という理由で採用しなかった）。

**この設計は完全な不正防止ではない。** 具体的には:

- スコア更新は「実在する・終了済みの・ランクマッチの部屋」を参照する形でしか行えず、荒唐無稽な自己申告（架空の勝利の量産）はできない。
- 1回の更新で動ける幅は`MAX_SCORE_DELTA`（Kファクターと同じ値）に上限を設ける。
- 同じ部屋の結果を二重に申告できないよう、部屋側に`settled.{black,white}`フラグを持たせ、スコア更新と同じ`writeBatch`で「未精算→精算済み」に一方向遷移させる。
- **既知の抜け穴**: この「同じバッチで部屋の精算フラグも一緒に立てる」という制約は、Firestoreルールの仕組み上、**1つのドキュメント単体のルールだけでは「同じバッチ内で別ドキュメントへの書き込みも必ず伴う」ことを強制できない**（ルールはドキュメントごとに独立して評価され、同一バッチ内の他の書き込みを検知する手段がない）。そのため、意図的に部屋側の精算フラグ更新だけを省いて`players/{uid}`のスコア更新だけを繰り返し送信するクライアントを、ルールだけで完全に防ぐことはできない。この抜け穴を完全に塞ぐには、Cloud Functions等のサーバー側での結果確定が必要になるが、v1のスコープ外とする（[CLAUDE.md](../../../CLAUDE.md)の「サーバーコードを自前で書かない」方針、カジュアル対戦が主目的という位置づけを優先した判断）。将来的に本格的な不正対策が必要になった場合はここを見直す。

## Eloライクなスコア計算（純粋関数）

`src/net/rating.js`に実装する。AdMob/Firebase同様、`src/net/`配下だが**この関数自体はFirebase依存を持たない純粋関数**とし、Node標準テストで検証する（`shouldShowInterstitial`と同じ位置づけ）。

```
DEFAULT_SCORE = 1500
K_FACTOR = 32
MAX_SCORE_DELTA = K_FACTOR   # 1試合で動きうる最大幅。ルール側の範囲チェックと共有する定数

function expectedScore(myScore, opponentScore):
  return 1 / (1 + 10 ^ ((opponentScore - myScore) / 400))

function calculateEloDelta(myScore, opponentScore, result):
  # result: 1 = 勝ち, 0 = 負け, 0.5 = 引き分け(オセロは引き分けがあるため考慮する)
  expected = expectedScore(myScore, opponentScore)
  delta = round(K_FACTOR * (result - expected))
  return delta   # 常に -MAX_SCORE_DELTA 〜 +MAX_SCORE_DELTA の範囲に収まる(数学的に保証される)
```

標準的なEloレーティング（チェス等で使われるもの）をそのまま採用し、独自のアレンジはしない。「格上に勝つと増分が大きい／格下に負けると減少が大きい」という要望は、この標準Elo式が自然に満たす性質そのものである。

## 階級（6段階・素材モチーフ）

スコアから導出する。Firestoreには保存せず、常に`score`から計算する（保存された`tier`と`score`が食い違うおそれをなくすため）。素材が硬く・希少になっていくイメージで並べ、各階級には元素記号を持たせる（[階級アイコン](#階級アイコンtier-icon)節参照）。

```
function getTierInfo(score):
  if score < 1600: return { id: 'iron',            label: 'アイアン',           symbol: 'Fe' }  # DEFAULT_SCORE(1500)はここ
  if score < 1700: return { id: 'aluminum',         label: 'アルミ',             symbol: 'Al' }
  if score < 1800: return { id: 'bronze',           label: 'ブロンズ',           symbol: 'Cu' }  # 合金なので構成元素の銅(Cu)を使う
  if score < 2000: return { id: 'silver',           label: 'シルバー',           symbol: 'Ag' }
  if score < 3000: return { id: 'diamond',          label: 'ダイヤ',             symbol: 'C'  }  # ダイヤモンドは炭素(C)の同素体
  else:            return { id: 'carbon-nanotube',  label: 'カーボンナノチューブ', symbol: 'C'  }  # これも炭素(C)の同素体

function getTier(score):
  return getTierInfo(score).label
```

閾値は初期値であり、実際のスコア分布を見て調整してよい（`src/net/rating.js`の定数を変更するだけで済むようにする）。`id`はCSSクラス名・アイコンのバリアント指定に使う安定した識別子（日本語の表示名をCSSクラス名にそのまま使うと事故りやすいため分離してある）。

### 階級アイコン（tier-icon）

コイン型（円形、ベゼル風の内側シャドウ）で中央に元素記号を書いた`<span>`を`src/ui/tier-icon.js`の`createTierIcon(score)`で生成する。ビルドツール・画像アセットを増やさないため、SVGや外部画像ではなく純粋にCSSグラデーションで着色する（`index.html`の`.tier-icon--<id>`）。

| 階級 | 色 |
|---|---|
| アイアン(Fe) | 白（やや温かみのあるオフホワイト） |
| アルミ(Al) | 白（やや冷たみのある明るい白） |
| ブロンズ(Cu) | 銅色 |
| シルバー(Ag) | 銀色 |
| ダイヤ(C) | ターコイズブルー |
| カーボンナノチューブ(C) | 虹色（conic-gradientで全周を回す） |

`getTier`と違い、アイコン描画には`id`/`symbol`が必要なため、表示系のコードは`getTierInfo(score)`を使う（`getTier`は表示名だけが要る文脈向けの簡易版）。

## データモデル（Firestore、追加分）

```
players/{uid}
  name: string                  # 1〜20文字、重複許可、フィルタリングなし
  score: number                 # 初期値 DEFAULT_SCORE(1500)
  gamesPlayed: number            # 初期値0
  updatedAt: serverTimestamp

rooms/{roomId}                  # ランダムマッチング由来の部屋のみ、以下を追加で持つ
  ranked: boolean                # true固定。ルームコード制の部屋には無い(存在しない=false相当)
  ratingSnapshot: { black: number, white: number }   # マッチ成立時点の両者のscore(Elo計算の基準値)
  settled: { black: boolean, white: boolean }        # 各色がスコア更新を精算済みか
```

`ratingSnapshot`は「マッチ成立時点」の値で固定し、対局中に（理論上）相手のスコアが変わっても計算がぶれないようにする。

## フロー

### プレイヤーネームの設定

初回のみ（`players/{uid}`が存在しない場合）スタート画面でネーム入力を求める。以降は`localStorage`にも直近値をキャッシュし、次回起動時の初期値に使う（正本は常にFirestore側）。

### ランダムマッチング成立時（`tryClaimCandidate`の拡張）

部屋作成時に、両者の現在の`score`を`ratingSnapshot`として書き込み、`ranked: true`・`settled: {black: false, white: false}`を設定する。

### マッチ成立時（対局開始前の対戦カード画面）

ランダムマッチングが成立した直後、実際の対局画面に入る前に`src/ui/vs-screen.js`の`createVsScreen`で対戦カード画面を挟む。先手（黒）を上、後手（白）を下に、それぞれ階級アイコン付きの名前とスコアを表示する。対戦相手のプロフィール取得（`getRoomSummary`→`getPlayerProfile`）に失敗した場合もフェイルソフトで対局自体は開始できるようにする（対戦カードの表示は対局そのものの前提条件ではない）。ルームコード制の対局（`create`/`join`）はこの画面を挟まない（対象はランダムマッチングのみ）。

### 対局終了時（`submitMove`の終局・`forfeitRoom`共通）

対局終了を検知した各クライアントが、**自分の分だけ**を`writeBatch`で以下の2件同時に書き込む。

```
function settleRankedResult(roomId, myColor, myResult):
  room = read rooms/{roomId}
  if not room.ranked: return   # ルームコード制の対局は対象外
  if room.settled[myColor]: return   # 既に精算済みなら何もしない

  myScore = room.ratingSnapshot[myColor]
  opponentScore = room.ratingSnapshot[opposite(myColor)]
  delta = calculateEloDelta(myScore, opponentScore, myResult)

  batch:
    update players/{myUid}: { score: myScore + delta, gamesPlayed: increment(1), updatedAt }
    update rooms/{roomId}: { settled.{myColor}: true }
  commit batch
```

`myResult`は`winner`フィールドから導出する（自分の色と一致すれば1、相手の色なら0、`winner == null`〈引き分け〉なら0.5）。

## Firestoreセキュリティルール（追加分）

`players/{playerId}`:
- `allow read: if true;`（ランキング表示のため公開）
- `allow create`: 本人のuid、`name`が1〜20文字の文字列、`score == DEFAULT_SCORE`、`gamesPlayed == 0`の場合のみ。
- 更新は**ケースごとに独立した`allow update`を複数書く**（[online-multiplayer](../online-multiplayer/SKILL.md)で得た教訓: 前提条件が異なる複数の更新パターンを1つの条件式に共通の前提でANDにまとめない）。
  - 名前変更: 本人のuid、`score`/`gamesPlayed`は不変。
  - スコア更新: 本人のuid、`name`は不変、`gamesPlayed`が+1、`score`の変化幅が`MAX_SCORE_DELTA`以内、かつ`get()`で参照先の`rooms/{roomId}`を読み、`status == 'finished' && ranked == true && (players.black == playerId || players.white == playerId) && settled[該当色] == false`であることを検証する。

`rooms/{roomId}`:
- 精算フラグ更新用のケース（`isSettling`）を`allow update`に追加する。本人が参加者であり、`settled[自分の色]`が`false`→`true`への一方向遷移であることのみを許可する（他フィールドは変更不可）。

## モジュール構成

- `src/net/rating.js` — Elo計算・階級判定の純粋関数（`calculateEloDelta`/`getTier`/`getTierInfo`/`DEFAULT_SCORE`等の定数）。**Firebase依存なし**、Node標準テストで検証する。
- `src/net/player-profile.js` — `players/{uid}`の作成・名前更新・取得（`getMyPlayerProfile`は自分、`getPlayerProfile(uid)`は任意のプレイヤー。対戦相手表示に使う）。Firestoreへの実際の読み書き（自動テスト対象外）。
- `src/net/rating-settlement.js` — 対局終了時のスコア精算（`writeBatch`）。精算結果（`beforeScore`/`afterScore`/`delta`）を呼び出し側に返し、スコア変動画面の描画に使う。Firestoreへの実際の読み書き（自動テスト対象外）。
- `src/net/room-sync.js` の `getRoomSummary(roomId)` — 対戦カード画面用の軽量な部屋情報の一度読み取り。
- `src/ui/tier-icon.js` — 階級アイコン（コイン型、CSSグラデーションのみ）のDOM要素生成。
- `src/ui/vs-screen.js` — マッチ成立時の対戦カード画面。
- `src/ui/score-change-screen.js` — 対局終了後のスコア変動可視化画面。
- `src/ui/start-screen.js` — プレイヤーネーム入力ステップ・ランキング画面・プロフィール画面を追加する。

## 参照

- [online-multiplayer](../online-multiplayer/SKILL.md) — ランダムマッチング・部屋のデータモデルの正本。この文書はその拡張。
