---
name: gan-cpu-self-play
description: 自己対戦強化学習（AlphaZero風）によるGAN CPU対戦相手の学習アルゴリズムの正本（盤面エンコーディング・ネットワーク構成・MCTS・自己対戦ループ・チェックポイント/レベル選定の疑似コードとエッジケース）。training/配下の学習コードを実装またはレビューする時は必ずこれを参照し、独自に再導出しない。
---

# GAN CPU 自己対戦学習の正本

CLAUDE.mdの「将来構想」に言う「GANベースのCPU対戦相手」は、Generator/Discriminator構成の古典的GANではなく、**方策/価値ネットワーク＋MCTSによる自己対戦強化学習（AlphaZero風）**を指す。「敵対的」とは、2つのエージェント（自分自身の過去/現在のコピー）が自己対戦を通じて相互に強くなり合う構造を指す。この文書は、将来どのセッションが実装しても同じ設計に収束させることを目的とした正本。

## スコープと前提

- 盤面・着手適用・終局判定は [othello-3d-flip-rule](../othello-3d-flip-rule/SKILL.md) および `src/logic/`（`board.js`, `flip-rule.js`, `game-state.js`）のロジックにそのまま従う。学習コード側で独自に再実装しない（Pythonへの移植が必要な部分のみ、同じ仕様で再実装する）。
- 対応する盤面サイズは `SUPPORTED_BOARD_SIZES`（4, 6, 8）の3種類。**サイズごとに重みを共有しない独立したモデルインスタンス**として、自己対戦・学習・チェックポイント選定を行う。実装・検証は8×8×8を最初に通し、パイプラインが機能することを確認してから4×4×4・6×6×6に展開することを推奨する。
- フレームワークは PyTorch。ブラウザ推論には ONNX（`torch.onnx.export`）で書き出す。
- 難易度レベルは全5段階: **レベル1は既存の `chooseRandomMove`（[cpu.js](../../../src/logic/cpu.js)）をそのまま採用**し、学習は不要。**レベル2〜5は本アルゴリズムで学習したチェックポイントから、自己対戦勝率（Elo的指標）に基づいて4段階選定**する。
- 実際のフル学習（大量の自己対戦・GPU長時間計算）は開発セッション外（ユーザーの手元環境またはクラウド）で実行する想定。このセッションで実装するのは学習コードそのものと、小規模データでの動作確認（スモークテスト）まで。

## 盤面エンコーディング

モデル入力は、常に「今から着手する側」から見た相対表現にする（色をそのまま渡さないことで、黒番・白番どちらでも同一ネットワークが使える）。

```
function encode_board(board, to_move, board_size):
  # shape: (2, board_size, board_size, board_size)
  # 軸の並びは (channel, z, y, x) とする。Conv3dの慣例(D, H, W)に合わせるためで、
  # board.js の indexOf(x, y, z) = x + y*size + z*size^2 というフラット順とは異なるので
  # 変換時に取り違えないこと。
  opponent = opposite(to_move)
  own_plane = zeros(board_size, board_size, board_size)
  opponent_plane = zeros(board_size, board_size, board_size)

  for z in range(board_size):
    for y in range(board_size):
      for x in range(board_size):
        cell = board[index_of(x, y, z, board_size)]
        if cell == to_move:
          own_plane[z][y][x] = 1.0
        elif cell == opponent:
          opponent_plane[z][y][x] = 1.0

  return stack([own_plane, opponent_plane])  # (2, D, H, W)
```

**方策の出力・入力インデックスは、`board.js` の `indexOf(x, y, z, boardSize) = x + y*boardSize + z*boardSize²` の順序に統一する。** これにより、JS側は変換なしに `policy[indexOf(x, y, z, boardSize)]` で候補手の事前確率を参照できる。

## ネットワーク構成

小規模な3D CNN（フルConvolution + 盤面サイズ依存の出力ヘッド）。`board_size` をコンストラクタ引数に取り、盤面サイズごとに別インスタンス（別重み）を学習する。

- **Stem**: `Conv3d(2 → C, kernel=3, padding=1)` → `BatchNorm3d` → `ReLU`
- **残差ブロック × N**: `[Conv3d(C→C,3,pad=1) → BN → ReLU → Conv3d(C→C,3,pad=1) → BN] + skip` → `ReLU`
- **方策ヘッド**: `Conv3d(C→2, kernel=1)` → `BN` → `ReLU` → `Flatten` → `Linear(2·boardSize³ → boardSize³)` → 合法手以外を `-inf` でマスクしてから `softmax`
- **価値ヘッド**: `Conv3d(C→1, kernel=1)` → `BN` → `ReLU` → `Flatten` → `Linear(boardSize³ → 64)` → `ReLU` → `Linear(64 → 1)` → `tanh`（`to_move` 視点の期待勝敗 `[-1, 1]`）

初期値の目安（計算資源に応じて `training/` 側の設定ファイルで調整する。数値そのものはこの正本が固定するものではない）:

| 定数 | 目安値 |
|---|---|
| `RESIDUAL_BLOCKS` | 6 |
| `BASE_CHANNELS` | 64 |
| `MCTS_SIMULATIONS_PER_MOVE` | 100 |
| `PUCT_C` | 1.5 |
| `DIRICHLET_ALPHA` / `DIRICHLET_EPSILON` | 0.3 / 0.25 |
| `TEMPERATURE_MOVE_THRESHOLD`（この手数までサンプリング、以降は貪欲） | 8 |
| `CHECKPOINT_INTERVAL_GAMES` | 200 |
| `BATCH_SIZE` | 256 |
| `LEARNING_RATE` | 1e-3（スケジュールで減衰） |
| `L2_WEIGHT_DECAY` | 1e-4 |

## MCTS（探索、疑似コード）

標準的なPUCTベースのMCTS。

```
function mcts_search(root_board, root_color, network, num_simulations):
  root = Node(prior=1.0)
  expand(root, root_board, root_color, network)
  add_dirichlet_noise(root)  # ルートのみに探索ノイズを加える

  for _ in range(num_simulations):
    node, board, color, path = root, root_board.copy(), root_color, [root]

    # Selection: PUCTスコア最大の子をleafまで辿る
    while node.is_expanded:
      move, node = select_child_by_puct(node)
      board = apply_move(board, move, color)  # flip-rule.js のapplyMoveと同じ仕様
      color = opposite(color)
      path.append(node)

    # Expansion + Evaluation
    if is_game_over(board):
      value = terminal_value(board, color)
    elif not has_valid_move(board, color):
      # パス局面: 展開せずに手番だけ交代して評価する
      value = -mcts_search(board, opposite(color), network, remaining_simulations)
    else:
      policy, value = network.predict(encode_board(board, color, board_size))
      expand(node, board, color, policy)  # get_valid_moves で得た合法手のみを子にする

    # Backup: 手番が交互なので符号を反転しながら伝播
    for node in reversed(path):
      node.visit_count += 1
      node.value_sum += value
      value = -value

  return normalized_visit_counts(root.children)  # 学習の教師信号 = 探索方策
```

- `expand` は必ず `get_valid_moves(board, color, board_size)` の結果だけを子ノードにする。方策ヘッドの生出力は非合法手にも非ゼロ確率を割り当てうるため、教師信号として使う前に合法手だけへ絞り込む。
- パス（合法手なし）の扱いは `game-state.js` の `getNextTurn` と同じセマンティクスにする: 手番を交代するだけで石は置かない。

## 自己対戦ループ

```
function play_self_play_game(network, board_size):
  board = create_initial_board(board_size)
  color = BLACK
  history = []  # (encoded_board, mcts_policy, color)

  while true:
    if not has_valid_move(board, color):
      next_color = opposite(color)
      if not has_valid_move(board, next_color):
        break  # 両者パス → 終局
      color = next_color
      continue

    visit_counts = mcts_search(board, color, network, MCTS_SIMULATIONS_PER_MOVE)
    policy = visit_counts_to_policy(visit_counts, temperature=current_temperature(ply))
    history.append((encode_board(board, color, board_size), policy, color))

    move = sample_or_argmax(policy)
    board = apply_move(board, *move, color, board_size)
    color = opposite(color)

  winner = get_winner(board)  # BLACK / WHITE / None(引き分け)
  return [
    (encoded, pol, terminal_value_for(winner, c))
    for (encoded, pol, c) in history
  ]

function terminal_value_for(winner, color):
  if winner is None: return 0.0
  return 1.0 if winner == color else -1.0
```

## 学習ステップ

```
function train_step(network, optimizer, batch):
  boards, target_policies, target_values = batch
  pred_policies, pred_values = network(boards)

  policy_loss = cross_entropy(pred_policies, target_policies)
  value_loss = mse(pred_values, target_values)
  loss = policy_loss + value_loss + L2_WEIGHT_DECAY * l2_norm(network.parameters())

  optimizer.zero_grad()
  loss.backward()
  optimizer.step()
```

自己対戦で生成した `(encoded_board, policy, value)` はリプレイバッファに蓄積し、`BATCH_SIZE` 件ずつサンプリングして学習する。

## チェックポイント方針

- `CHECKPOINT_INTERVAL_GAMES` 局（自己対戦ゲーム数）ごとに、その時点の重みを `training/checkpoints/{board_size}/game_{n:06d}.pt` として保存する。
- チェックポイントは大量に生成される学習の副産物であり、リポジトリにコミットしない（`.gitignore` の `training/checkpoints/` で除外済み）。

## 強さ評価とレベル選定（Elo的指標）

学習ステップ数と実際の強さは必ずしも単調に対応しない（学習が停滞・後退する局面がありうる）ため、チェックポイント同士を対局させた実測の勝率でレベルを決める。

```
function evaluate_checkpoints(checkpoints, games_per_matchup):
  ratings = initialize_elo(checkpoints, base=1500)

  for (a, b) in sampled_matchups(checkpoints):  # 総当たりは計算量が大きいためサンプリング
    for _ in range(games_per_matchup):
      # 先後を入れ替えて対局し、手番による有利不利の偏りを抑える
      winner = play_match(a, b, first_player=alternate())
      update_elo(ratings, a, b, winner)

  return ratings
```

- 対局はMCTS込みで行う（生ネットワーク同士では評価がノイジーになりやすいため）。
- 全チェックポイントのEloが求まったら、**最弱〜最強のレーティング範囲を4分位に分割し、各区分の代表チェックポイントをレベル2〜5に割り当てる**（レベル2が最弱、レベル5が最強）。
- レベル1（最下級）は既存の `chooseRandomMove` を採用し、この評価プロセスには含めない。

## ブラウザ推論仕様（Phase D向けの取り決め）

- 選定した4チェックポイント × 3盤面サイズ = 最大12モデルを `torch.onnx.export` でONNX形式に書き出す。配置場所は別途決定する。
- **入力**: shape `(1, 2, boardSize, boardSize, boardSize)`。`encode_board` と同じ規約。
- **出力**: `policy_logits`（shape `(1, boardSize³)`、`indexOf(x,y,z,boardSize)` 順）と `value`（shape `(1, 1)`）。
- ブラウザ側では軽量化のため **MCTSは実行せず**、`policy_logits` を合法手のインデックスだけに絞ってsoftmax（または単純にargmax）し、その分布から着手を選ぶ。生方策のみでの手応えが弱すぎる場合は、軽量なJS側MCTSの追加を将来の改善として検討する（今回のスコープ外）。

## エッジケース

1. **合法手がない（パス）局面**: MCTS展開前に `has_valid_move` を確認し、パスの場合は探索せず手番のみ交代する。
2. **両者パスで終局**: 自己対戦ループを打ち切り、`get_winner` で勝敗を決定する。
3. **引き分け**: `winner` が `None` の場合、教師信号の価値は `0.0` とする。
4. **盤面サイズごとに重みを共有しない**: 4/6/8はそれぞれ独立したモデルインスタンス・チェックポイント系列・レベル選定として扱う。
5. **方策ヘッドの非合法手への漏れ**: `expand` は必ず `get_valid_moves` で得た合法手だけを子ノードにし、教師信号（`visit_counts`）も合法手にしか立たないようにする。

## 参照

- 盤面・反転ルール・終局判定の正本: [othello-3d-flip-rule](../othello-3d-flip-rule/SKILL.md)
- Pythonコーディング規約: [python/style-guide.md](../../rules/python/style-guide.md)
- テスト方針（学習コードの純粋関数部分に必須）: [testing.md](../../rules/common/testing.md)
