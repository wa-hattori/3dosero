# Python スタイルガイド（具体例）

正本は [CLAUDE.md](../../../CLAUDE.md) の「Python コーディング規約」節。本ファイルはそれを本プロジェクトの学習コード（`training/` 配下、GANベースCPU対戦相手向け）に即した具体例で補強する。ルール自体を変更する場合は CLAUDE.md 側を先に更新すること。

## 型ヒントとdocstring

```python
# Bad
def encode_board(board, color):
    ...


# Good
def encode_board(board: list[int], color: int) -> "Tensor":
    """盤面状態をモデル入力用テンソルに変換する。

    Args:
        board: 現在の盤面状態（フラット化された石の配列）。
        color: エンコード対象の手番の色。

    Returns:
        モデル入力用のテンソル。
    """
    ...
```

## 定数とマジックナンバー

```python
# Bad
if step % 1000 == 0:
    save_checkpoint(model, step)

# Good
CHECKPOINT_INTERVAL_STEPS = 1000

if step % CHECKPOINT_INTERVAL_STEPS == 0:
    save_checkpoint(model, step)
```

## 純粋関数と学習ループの分離

学習ループ自体（乱数・IO・GPU状態に依存する）とは別に、テスト可能な部分は純粋関数として切り出す。

```python
# Bad: 盤面エンコーディングと学習ループの副作用が同じ関数に混在
def train_step(board, color, model, optimizer):
    tensor = board_to_tensor(board, color)  # ここだけなら純粋関数にできる
    loss = model(tensor)
    optimizer.step()
    return loss


# Good: 純粋関数として切り出し、個別にユニットテストできるようにする
def board_to_tensor(board: list[int], color: int) -> "Tensor":
    """副作用なし。単体でテスト可能。"""
    ...


def train_step(board, color, model, optimizer):
    tensor = board_to_tensor(board, color)
    loss = model(tensor)
    optimizer.step()
    return loss
```

## 命名の具体例

```python
# 変数・関数: snake_case
board_state = create_initial_board()


def is_valid_move(board, x, y, z, color):
    ...


# クラス: PascalCase
class PolicyValueNetwork:
    ...


# 定数: UPPER_SNAKE_CASE
CHECKPOINT_INTERVAL_STEPS = 1000

# ファイル名: snake_case.py
# board_encoding.py, self_play.py, checkpoint_eval.py
```

## ディレクトリ構成方針

- `training/` — 学習コード一式。ブラウザ側の `src/` とは独立し、`three` やDOM APIは一切登場しない。
- テストの配置・命名規則は [testing.md](../common/testing.md) を参照。
- 学習済みモデルの重み・チェックポイントファイルはリポジトリに含めない（`.gitignore` 参照）。ブラウザ推論用に変換したエクスポート成果物の配置場所は、推論方式が確定した時点で別途定める。
