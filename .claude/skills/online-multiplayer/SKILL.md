---
name: online-multiplayer
description: Firebase Firestoreを使ったオンライン対戦（ルームコード制・ランダムマッチング・盤面のリアルタイム同期）の正本。src/net/配下の実装またはレビュー時は必ずこれを参照し、独自に再導出しない。
---

# オンライン対戦の正本

CLAUDE.mdの「オンライン対戦」に対応する具体的な設計。**サーバーコードを自前で書かない**（GitHub Pagesは静的ファイルしか配信できないため）。Firebase Firestoreをクライアントから直接読み書きする、いわゆる"serverless"構成にする。

## スコープと前提（v1）

- 対応するのは**Web版のみ**。iOSアプリ（`ios-app/`）への反映は別途行う（[ios-native-packaging](../ios-native-packaging/SKILL.md)は現状「完全オフライン・通信なし」を前提にしており、オンライン対戦を持ち込む際はプライバシーポリシー・審査文言の更新が必要になる。今回は対象外）。
- マッチメイキングは**ルームコード制**（部屋を作って合言葉を共有）と**ランダムマッチング**（誰かと自動で組む）の両方に対応する。
- 対応する盤面サイズは`SUPPORTED_BOARD_SIZES`（4, 6, 8）。ルームは特定の1サイズに紐づく。
- **v1のスコープ外**（後から追加しても中核設計をやり直す必要がないと判断したため後回し）:
  - 切断・再接続の丁寧な処理（相手の手が来ないときにどう見せるか程度に留める）
  - 観戦機能
  - チャット
  - 対局中のUndo・引き分け提案など対人戦特有の追加機能
- **信頼境界（重要）**: セキュリティルールでは「誰が」「自分の手番の時だけ」書き込めるかは強制できるが、「その着手が26方向反転ルール上合法か」まではFirestoreのルール言語では現実的に検証できない（`src/logic/`のロジックと二重管理になり保守不能なため）。**v1では、書き込み前にクライアント側で`src/logic/`の`isValidMove`/`applyMove`を使って検証する「性善説」の設計とする。** 悪意のあるクライアントが不正な盤面を書き込む可能性は残るが、友人同士のカジュアル対戦が主目的のv1では許容する。

## 認証: Firebase Anonymous Authentication

アカウント登録・個人情報入力なしで、ブラウザセッションごとに安定した`auth.uid`を得るため`signInAnonymously()`を使う。この`uid`が、セキュリティルールで「ルーム参加者本人か」を判定する唯一の手がかりになる。ブラウザのデータを消す・別ブラウザを使うとuidは変わる（再ログイン相当の概念がない）が、v1では許容する。

## データモデル（Firestore）

```
rooms/{roomId}
  boardSize: number            # 4 | 6 | 8
  board: number[]               # index_of(x,y,z,boardSize)順のフラット配列。0=空 1=黒 2=白
  players: { black: uid, white: uid | null }   # キー名は固定。値は各プレイヤーのuid
  currentTurn: number           # src/logic/board.jsのBLACK(1) | WHITE(2)をそのまま保存
  status: 'waiting' | 'in_progress' | 'finished'
  winner: number | null         # BLACK(1) | WHITE(2) | null(引き分け、またはstatusがfinishedでなければ「未定」)
  lastMove: { x, y, z, color } | null   # colorもBLACK(1)|WHITE(2)。直前の着手(受信側のアニメーション・ハイライト用)
  createdAt: serverTimestamp
  updatedAt: serverTimestamp

matchmakingQueue/{ticketId}
  boardSize: number
  uid: string                   # チケット作成者
  status: 'waiting' | 'matched'
  roomId: string | null         # マッチ成立時に埋まる
  createdAt: serverTimestamp
```

`board`を毎回上書きする設計にし、着手履歴を別コレクションで持たない（v1では棋譜再生等の機能を持たないため。必要になったら`rooms/{roomId}/moves/{n}`のサブコレクションとして後から追加できる、既存フィールドへの破壊的変更にはならない）。

## ルームコード制のフロー

```
function createRoom(boardSize, myUid):
  roomId = generate_room_code()  # 例: 紛らわしい文字(0/O/1/I)を除いた6桁英数字
  write rooms/{roomId} = {
    boardSize, board: create_initial_board(boardSize),
    players: { black: myUid, white: null },
    currentTurn: BLACK, status: 'waiting', winner: null, lastMove: null,
  }
  return roomId

function joinRoom(roomId, myUid):
  room = read rooms/{roomId}
  if room is null: raise RoomNotFoundError
  if room.status != 'waiting': raise RoomNotJoinableError
  update rooms/{roomId}: players.white = myUid, status = 'in_progress'
```

`generate_room_code`・コード形式の妥当性検証は純粋関数として`src/net/room-code.js`に切り出し、Node標準テストで検証する。

## ランダムマッチングのフロー（サーバーレスでの排他制御）

Cloud Functions等のサーバー処理を使わず、クライアントの`runTransaction`だけで「2人が同時に同じ相手を取り合う」競合を避ける。

**【実際に踏んだ不具合】`boardSize`・`status`の等価条件2つと`createdAt`の並べ替えを組み合わせたクエリは、Firestore側に複合インデックスを事前作成しないと`FirebaseError: The query requires an index`で失敗する。** セキュリティルールのレビューでは気づけない種類の不具合（インデックスの有無はルールとは完全に別の設定であり、実際にこのクエリを本番のFirestoreに対して実行するまで顕在化しない）で、実機ではなく結合テストで発見した。`firestore.indexes.json`（リポジトリルート）に複合インデックスを定義し、`firebase.json`の`firestore.indexes`から参照させることで、`firebase deploy --only firestore:indexes`（または`firestore:rules,firestore:indexes`のように併記）で反映できるようにした。**新しいクエリ（複数の`where`＋`orderBy`の組み合わせ）を追加する際は、複合インデックスが必要にならないか毎回疑うこと。**

```
function requestRandomMatch(boardSize, myUid):
  myTicket = create matchmakingQueue/{myTicketId} = {
    boardSize, uid: myUid, status: 'waiting', roomId: null,
  }
  candidates = query matchmakingQueue
    where boardSize == boardSize and status == 'waiting' and uid != myUid
    order by createdAt asc, limit 5

  for candidate in candidates:
    matched = runTransaction(tx => {
      freshCandidate = tx.read(candidate.ref)
      if freshCandidate.status != 'waiting': return false   # 他クライアントに先を越された
      roomId = generate_room_code()
      tx.write(rooms/{roomId}, { boardSize, board: create_initial_board(boardSize),
        players: { black: candidate.uid, white: myUid },
        currentTurn: BLACK, status: 'in_progress', winner: null, lastMove: null })
      tx.update(candidate.ref, { status: 'matched', roomId })
      tx.update(myTicket.ref, { status: 'matched', roomId })
      return true
    })
    if matched: return  # myTicket.roomId をlistenしているUI側が遷移する

  # 候補が見つからない/全て競合で失敗 → 自分のチケットをlistenして
  # 他プレイヤーから見つけてもらうのを待つ
```

- 両クライアントとも、**自分のチケットドキュメントを`onSnapshot`で購読**し、`roomId`が埋まったらその部屋に遷移する。「見つけた側」がトランザクションで部屋を作る役、「見つかった側」は自分のチケット更新を待つだけなので、役割が対称でなくても両者とも同じコード（`requestRandomMatch`）を呼ぶだけでよい。
- `runTransaction`が競合（同時に複数のクライアントが同じチケットを狙った）を検知した場合は`freshCandidate.status != 'waiting'`のチェックで弾かれ、次の候補にフォールバックする。
- 一定時間マッチしない場合のタイムアウト・チケットの自動削除は、Firestore単体では「〆切が来たら自動実行」ができないため（サーバー処理が必要）、v1では**ユーザーがキャンセル操作をした時に明示的にチケットを削除する**運用に留める。

## 盤面同期のフロー

```
function submitMove(roomId, myColor, x, y, z, currentBoard, boardSize):
  if not isValidMove(currentBoard, x, y, z, myColor, boardSize):
    raise IllegalMoveError   # 送信前にローカルで弾く(信頼境界の節を参照)
  nextBoard = applyMove(currentBoard, x, y, z, myColor, boardSize)
  nextTurn = getNextTurn(nextBoard, myColor, boardSize)   # 相手がパスなら手番はそのまま自分に戻る
                                                            # 終局なら null が返る(getNextTurnの契約)
  isOver = (nextTurn == null)
  update rooms/{roomId}: {
    board: nextBoard,
    currentTurn: isOver ? myColor : nextTurn,   # 終局後もフィールドとしては値を残す(未使用)
    status: isOver ? 'finished' : 'in_progress',
    winner: isOver ? getWinner(nextBoard) : null,
    lastMove: { x, y, z, color: myColor },
  }
```

盤面適用・手番判定・終局判定は`src/logic/`（`flip-rule.js`/`game-state.js`）を**そのまま再利用**し、オンライン対戦用に別ロジックを作らない（[othello-3d-flip-rule](../othello-3d-flip-rule/SKILL.md)が唯一の正本であることに変わりはない）。`src/net/`は「いつ・何を読み書きするか」だけを扱う。

受信側は`rooms/{roomId}`を`onSnapshot`で購読し、`board`/`currentTurn`/`status`が変わるたびにローカルの描画状態を更新する。

## 対局放棄のフロー（`forfeitRoom`）

対局中に「タイトルに戻る」で離脱した場合、何もしなければ相手が`status: 'in_progress'`のまま永遠に待機し続けてしまう（実機テストで発見した不具合）。離脱した側を無条件で敗北、相手を無条件で勝利として即座に終局させる。

```
function forfeitRoom(roomId, myColor):
  update rooms/{roomId}: {
    status: 'finished',
    winner: opposite_color(myColor),   # 離脱した側と逆の色が勝者
  }
```

`submitMove`と異なり、**自分の手番でなくても呼べる**（相手の手番中に離脱するケースがあるため）。盤面(`board`)はそれ以上変更せず、離脱時点の状態のまま凍結する。UI側は`src/ui/title-button.js`の`onBeforeLeave`フックから、オンライン対戦かつ対局がまだ終わっていない場合にのみ呼ぶ（[src/main.js](../../../src/main.js)参照）。受信側は通常の終局（`submitMove`経由）と全く同じ`status`/`winner`フィールドの変化として検知するため、購読側に特別な分岐は不要。

## Firestoreセキュリティルール（`firestore.rules`）

方針:
- `rooms/{roomId}`: 誰でも読める（観戦の将来拡張を妨げないため）。
  - **作成**には2つの形があり、いずれか一方を満たせば許可する。(1) ルームコード制: 作成者が黒番として自分自身を登録し、白番は空席、ステータスが「待機中」。(2) ランダムマッチング: 待機中の相手を見つけた側が、その場で相手を黒番・自分を白番として両者を埋めた「進行中」の部屋を直接作る（`src/net/matchmaking.js`の`tryClaimCandidate`参照）。**この2ケースも前提が異なる**（(1)は白番が空席・ステータス待機中、(2)は白番も埋まっていてステータス進行中）ため、同じ条件式には統合できず、`OR`で結んだ別ケースとして扱う必要がある（実機の統合テストで、ランダムマッチングの部屋作成がルームコード制用の条件式にしか対応していないために失敗する不具合を発見した）。
  - **更新**は「参加（白番の空席を自分のuidで埋める）」「既存参加者が自分の手番で着手する」「既存参加者が対局を放棄する（`forfeitRoom`、相手の手番中でも可）」のいずれかに該当する場合のみ許可する。**これらのケースは前提条件がそれぞれ異なる点に注意する**: 参加は「まだこの部屋の参加者ではない」人が行う操作、着手は「既にこの部屋の参加者かつ自分の手番」の人が行う操作、放棄は「既にこの部屋の参加者だが手番は問わない」人が行う操作。「部屋の参加者(黒番または白番)であること」のような共通の前提条件を全ケースに先にANDで課してはいけない。それをすると一部の操作が常に拒否される（実機の統合テストで実際に発見した不具合。参加者を求める前提条件を満たせるのは参加後であって参加前ではないため、循環的に成立し得ない）。ケースごとに個別の条件式として`OR`で結ぶこと（`firestore.rules`の`isJoining`/`isMyTurn`/`isForfeiting`参照）。`isForfeiting`は、離脱した本人が自分を勝者と偽れないよう、`winner`が必ず自分と逆の色になっていることを検証する。
  - **教訓**: `allow create`/`allow update`とも、「同じフィールドに複数の書き込みパターンがあり、それぞれ前提条件が異なる」場合は、共通の前提条件でANDにまとめようとせず、パターンごとに完結した条件式を`OR`で結ぶこと。今回2回とも同じ種類のミス（本来は互いに排他的な複数ケースを、共通の前提条件で誤って束ねてしまう）を犯しており、再発しやすい罠だと考えられる。
- `matchmakingQueue/{ticketId}`: 作成は`request.auth.uid == request.resource.data.uid`の場合のみ。更新（マッチ成立）は誰でも行える必要がある（相手のチケットを自分がマッチさせるトランザクションが発生するため）が、`status`を`'waiting'`から`'matched'`にする一方向の遷移のみ許可し、それ以外のフィールド改ざんは拒否する。削除（`cancelRandomMatch`）はチケット作成者本人のみ許可する。**【実際に踏んだ不具合】`allow delete`ルール自体が欠落しており、`cancelRandomMatch`が常に権限エラーで失敗する状態だった。** 結合テストでランダムマッチングを試した際、以前の失敗した試行が`waiting`状態のまま片付けられずゴミチケットとして残り続け、後続のテストが無関係な古いチケットとマッチしてしまうという形で発覚した（このゴミデータのせいでテスト結果が混乱したため、根本原因の特定にはやや遠回りした）。CRUD全操作（read/create/update/delete）を実装する際は、遷移させる`update`だけでなく`delete`のような「終わらせる」操作のルールも忘れずに定義すること。

実際のルールファイルは`firestore.rules`（リポジトリルート）に、複合インデックスは`firestore.indexes.json`（リポジトリルート、`firebase.json`の`firestore.indexes`から参照）に実装する。**Firebaseへの反映はユーザー側の手動作業**（Firebase CLIのセットアップ、プロジェクトへのログインが必要なため）で、`firebase deploy --only firestore:rules,firestore:indexes --project <プロジェクトID>`で両方まとめて反映できる。**ルール・インデックスを変更した際は、このコマンドを再度実行しない限りFirebase側には反映されない**ことに注意する（コード変更をコミットしただけでは有効にならない）。

## モジュール構成（`src/net/`）

`src/logic/`（純粋関数・DOM/three/非同期I/O禁止）とも`src/ai/`（GAN CPU推論、onnxruntime-web依存）とも独立したモジュール群にする。

- `src/net/room-code.js` — ルームコードの生成・書式検証。**純粋関数、Firebase依存なし**。Node標準テストで検証する。
- `src/net/board-serialization.js` — 盤面（`Int8Array`）とFirestoreの配列表現の相互変換。**純粋関数、Firebase依存なし**。Node標準テストで検証する。
- `src/net/firebase-init.js` — Firebase App/Firestore/Authの初期化（CDN経由のESモジュール）。設定値は`src/net/firebase-config.js`から読む。
- `src/net/firebase-config.js` — プロジェクトごとのFirebase設定値（`apiKey`等）。**実際の値はユーザーがFirebaseコンソールでプロジェクトを作成した後に埋める**。プレースホルダーの状態でコミットする。
- `src/net/room-sync.js` — `createRoom`/`joinRoom`/`submitMove`/`subscribeToRoom`。Firestoreへの実際の読み書き（非同期I/O、自動テスト対象外は`testing.md`の方針に準ずる）。
- `src/net/matchmaking.js` — `requestRandomMatch`/`subscribeToTicket`/`cancelRandomMatch`。トランザクションによる排他制御を含む。

## 参照

- [othello-3d-flip-rule](../othello-3d-flip-rule/SKILL.md) — 盤面適用・反転判定の正本（オンライン対戦でも変更なくそのまま使う）
- [ios-native-packaging](../ios-native-packaging/SKILL.md) — iOS版への反映時に、オフライン前提の記述を更新する必要がある
- [Firebase Firestore Web SDK (CDN)](https://firebase.google.com/docs/web/setup#add-sdk-and-initialize)
