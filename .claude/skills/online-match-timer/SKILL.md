---
name: online-match-timer
description: オンライン対戦（ルームコード制・ランダムマッチング共通）の一手タイマー・持ち時間・時間切れ負けの正本。src/net/game-timer.js・rooms/{roomId}のtimeBank/turnStartedAtフィールド関連の実装・レビュー時は必ずこれを参照し、独自に再導出しない。
---

# オンライン対戦の一手タイマー・持ち時間の正本

[online-multiplayer](../online-multiplayer/SKILL.md)のオンライン対戦（ルームコード制・ランダムマッチング両方）に、対局を長引かせない・一方的に待たせないための時計を追加する。**対象はオンライン対戦のみ**（CPU対戦・2人対戦〈同一端末〉には適用しない。ユーザーとの合意事項）。

## スコープと時計のルール

- **一手タイマー**: 自分の手番になってから30秒（`MOVE_TIME_LIMIT_MS`）以内に着手しなければならない。超えると即座にそのプレイヤーの負け。
- **持ち時間**: 対局開始時、両者とも5分（`MAIN_TIME_BANK_MS`）。自分の手番中はリアルタイムで減っていく通常のチェスクロック方式。持ち時間が0になった場合も即座にそのプレイヤーの負け（一手タイマーが残っていても関係ない）。
- **インクリメント**: 一手を30秒以内に打てた場合、一手タイマーの「余り」（`30秒 - 実際にかかった時間`）を持ち時間に加算する。早く打つほど持ち時間が増え、30秒ギリギリまで使うと持ち時間が正味減っていく（標準的なFischerインクリメントに近いが、増分が固定値ではなく「一手タイマーの余り」である点が異なる）。この式から、1手あたりの持ち時間の変動幅は必ず`±MOVE_TIME_LIMIT_MS`以内に収まる。

## 純粋関数（`src/net/game-timer.js`）

Firebase依存を持たない純粋関数のみを置く（`rating.js`と同じ位置づけ）。Node標準テストで検証する。

```
MOVE_TIME_LIMIT_MS = 30_000
MAIN_TIME_BANK_MS = 5 * 60 * 1000
COUNTDOWN_BEEP_THRESHOLD_MS = 5_000   # この残り時間以下で1秒ごとに音を鳴らす

function createInitialTimeBank():
  return { black: MAIN_TIME_BANK_MS, white: MAIN_TIME_BANK_MS }

function computeMoveTimeRemainingMs(elapsedMs):
  return MOVE_TIME_LIMIT_MS - elapsedMs

function computeMainBankRemainingMs(bankMs, elapsedMs):
  return bankMs - elapsedMs   # 手番開始時点の値から、この手番中の消費を差し引いたライブな値

function hasTimedOut({ moveTimeRemainingMs, mainBankRemainingMs }):
  return moveTimeRemainingMs <= 0 || mainBankRemainingMs <= 0

function computeNextTimeBank(bankMs, elapsedMs):
  # 着手成立時に保存する、次の持ち時間
  clampedElapsed = clamp(elapsedMs, 0, MOVE_TIME_LIMIT_MS)
  leftoverMs = MOVE_TIME_LIMIT_MS - clampedElapsed
  return max(0, bankMs - clampedElapsed + leftoverMs)
```

## データモデル（Firestore、追加分）

```
rooms/{roomId}                  # オンライン対戦の部屋すべて（ルームコード制・ランダムマッチング共通）
  timeBank: { black: number, white: number }   # 各色の残り持ち時間(ミリ秒)。対局開始時MAIN_TIME_BANK_MS
  turnStartedAt: serverTimestamp | null   # 現在の手番が始まった時刻。対局中は必ず非null
```

- `timeBank`はルームコード制の部屋も含め全部屋に持たせる（`ranked`のようにレート戦限定のフィールドではない）。
- `turnStartedAt`は「両者が揃って対局が実際に始まった瞬間」にセットする。ルームコード制では`createRoom`の時点ではまだ相手がいないため、`joinRoom`（白番が参加し`status`が`in_progress`になる瞬間）でセットする。ランダムマッチングでは`tryClaimCandidate`が部屋を`in_progress`で直接作るため、作成時にセットする。

## 時刻の同期についての既知の限界

`turnStartedAt`はFirestoreサーバーの時刻（`serverTimestamp()`）だが、経過時間の計算（`elapsedMs = Date.now() - turnStartedAtMs`）はクライアントのローカル時計で行う。**クライアントの時計がサーバーとずれていた場合、表示される残り時間や判定タイミングにその分の誤差が乗る。** NTP同期のような厳密なクロック補正は行わない（カジュアル対戦が主目的の本プロジェクトでは過剰、[ranked-matchmaking](../ranked-matchmaking/SKILL.md)のEloの不正防止方針と同じ「完璧でなくてよい」判断）。同じクライアントが描画とタイムアウト判定の両方に同じ`Date.now()`基準を使うため、少なくとも自分の画面内では一貫した挙動になる。

## 時間切れの検知・報告（サーバーレスでの実現方法）

Cloud Functions等のサーバー側コードを書かない方針（[CLAUDE.md](../../../CLAUDE.md)）のため、時間切れの検知は**両クライアントがそれぞれローカルで同じ計算をして監視し、先に気づいた方がFirestoreに書き込む**方式を取る（「タイトルに戻る」による対局放棄〈`forfeitRoom`〉と同じ考え方）。

```
# 対局中、両クライアントとも一定間隔(数百ms)でtickする
function onTick(room):
  elapsedMs = Date.now() - room.turnStartedAtMs
  moverKey = colorKey(room.currentTurn)
  moveTimeRemainingMs = computeMoveTimeRemainingMs(elapsedMs)
  mainBankRemainingMs = computeMainBankRemainingMs(room.timeBank[moverKey], elapsedMs)

  if hasTimedOut({ moveTimeRemainingMs, mainBankRemainingMs }):
    submitTimeoutLoss(roomId, timedOutColor: room.currentTurn)   # 早い者勝ちで書き込む
```

`submitTimeoutLoss`（`src/net/room-sync.js`）は`status: 'finished'`, `winner: oppositeColor(timedOutColor)`を書き込む。両クライアントがほぼ同時に気づいて両方書き込もうとしても、Firestoreルール側で「部屋が`in_progress`である場合のみ」書き込みを許可するため、後から届いた方は自然に拒否される（`forfeitRoom`と同じレース処理）。この拒否はエラーではなく正常系として静かに無視する。

## 着手時のtimeBank更新

`submitMove`（`src/net/room-sync.js`）は着手の書き込みと同時に、以下も1つの`updateDoc`で更新する。

- `timeBank.<自分の色>`: `computeNextTimeBank(現在の値, elapsedMs)`
- `timeBank.<相手の色>`: 変更しない
- `turnStartedAt`: 対局が続く場合は`serverTimestamp()`（次の手番の起点）、対局が終わった場合は`null`

## Firestoreセキュリティルール（追加分）

`rooms/{roomId}`の`allow update`に以下を追加する。

- **`isMyTurn`（既存の着手ケース）に、`timeBank`の変動幅チェックを追加する**: 自分の色の`timeBank`だけが変化し、かつ変化後の値が`0`以上・変化前の値`+ MOVE_TIME_LIMIT_MS`以下であることを検証する（[ranked-matchmaking](../ranked-matchmaking/SKILL.md)の`MAX_SCORE_DELTA`と同じ、1回の書き込みあたりの変動幅を絞るだけの軽量な不正防止）。相手側の`timeBank`は不変であることも検証する。`30000`はこのファイル冒頭の`MOVE_TIME_LIMIT_MS`をそのまま数値リテラルにしたもの（ルール言語からはJSの定数をimportできない事情は他の箇所と同じ）。
- **`isTimingOut`（新規ケース）**: 部屋の参加者（黒番・白番どちらでもよい。相手のタイムアウトを検知して書き込む場合があるため）が、`status: 'in_progress' → 'finished'`にでき、かつ`winner`が「タイムアウトが起きた時点で手番だった側の逆の色」と一致する場合のみ許可する。

```
function isValidTimeBankUpdate(before, after):
  moverKey = before.currentTurn == 1 ? 'black' : 'white'
  opponentKey = moverKey == 'black' ? 'white' : 'black'
  return after.timeBank[opponentKey] == before.timeBank[opponentKey]
    && after.timeBank[moverKey] >= 0
    && after.timeBank[moverKey] <= before.timeBank[moverKey] + 30000

function isTimingOut(before, after):
  requesterIsParticipant = before.players.black == request.auth.uid || before.players.white == request.auth.uid
  expectedWinner = before.currentTurn == 1 ? 2 : 1
  return requesterIsParticipant
    && before.status == 'in_progress'
    && after.status == 'finished'
    && after.winner == expectedWinner
```

### 既知の限界（不正防止）

[ranked-matchmaking](../ranked-matchmaking/SKILL.md)と同じ思想: `isValidTimeBankUpdate`は1回の書き込みあたりの変動幅を絞るだけで、「毎回`elapsedMs: 0`を偽って送り続け、持ち時間を際限なく水増しする」ような悪意ある継続的な不正までは防げない（1回ごとの値は常に正当な範囲に収まるため）。完全に防ぐには着手履歴の集計や信頼できるサーバー時刻でのタイムスタンプ検証（Cloud Functions等）が必要だが、v1のスコープ外とする。同様に、`isTimingOut`もクライアントの「タイムアウトが起きた」という自己申告を信頼する（`forfeitRoom`の`isForfeiting`と同じ信頼レベル）。

## UI（`src/ui/game-timer-view.js`）

オンライン対戦画面のみに表示する。両者の持ち時間（mm:ss）を常時表示し、手番側は追加で一手タイマーの残り秒数を表示する。一手タイマーの残りが`COUNTDOWN_BEEP_THRESHOLD_MS`（5秒）以下になったら、1秒ごとに`data/決定ボタンを押す52.mp3`を鳴らす（`src/audio/countdown-beep.js`、他の効果音と同じ`encodeURI('data/...')`パターン）。ミュートトグルの対象に含める（BGM・クリック音と同じ扱い）。

## モジュール構成

- `src/net/game-timer.js` — 時間計算の純粋関数。**Firebase依存なし**、Node標準テストで検証する。
- `src/net/room-sync.js` — `createRoom`/`joinRoom`/`submitMove`が`timeBank`/`turnStartedAt`を読み書きする。`submitTimeoutLoss(roomId, timedOutColor)`を追加する。
- `src/net/matchmaking.js` — `tryClaimCandidate`が部屋作成時に`timeBank`/`turnStartedAt`を初期化する。
- `src/ui/game-timer-view.js` — 時計の描画・ローカルでのtick・タイムアウト検知（`onTimeout`コールバック経由で`submitTimeoutLoss`を呼ぶのは呼び出し側`src/main.js`の責務）。
- `src/audio/countdown-beep.js` — カウントダウン音の再生。

## 参照

- [online-multiplayer](../online-multiplayer/SKILL.md) — オンライン対戦・部屋のデータモデルの正本。この文書はその拡張。
- [ranked-matchmaking](../ranked-matchmaking/SKILL.md) — 同じ「クライアント計算＋ルールは変動幅チェックのみ」という不正防止の設計方針の先例。
