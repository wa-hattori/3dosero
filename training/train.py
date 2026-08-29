"""学習ステップとチェックポイント保存。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「学習ステップ」節・
「チェックポイント方針」節。
"""

from __future__ import annotations

from pathlib import Path

import torch
import torch.nn.functional as functional

from training.config import CHECKPOINT_INTERVAL_GAMES, L2_WEIGHT_DECAY
from training.network import PolicyValueNetwork

TrainingBatch = tuple[torch.Tensor, torch.Tensor, torch.Tensor]
"""`(boards, target_policies, target_values)` のタプル。"""


def compute_loss(
    network: PolicyValueNetwork,
    boards: torch.Tensor,
    target_policies: torch.Tensor,
    target_values: torch.Tensor,
    l2_weight_decay: float = L2_WEIGHT_DECAY,
) -> torch.Tensor:
    """SKILL.mdの学習ステップの損失（方策 + 価値 + L2正則化）を計算する。

    Args:
        network: 損失を計算する対象のネットワーク。
        boards: shape `(batch, 2, board_size, board_size, board_size)` の入力盤面。
        target_policies: shape `(batch, board_size ** 3)` の教師方策分布
            （MCTSの正規化済み訪問回数。合法手以外は`0`）。
        target_values: shape `(batch, 1)` の教師価値（`[-1, 1]`）。
        l2_weight_decay: L2正則化の重み。

    Returns:
        スカラーの合計損失テンソル（`policy_loss + value_loss + l2項`）。
    """
    pred_policies, pred_values = network(boards)
    target_values = target_values.reshape(pred_values.shape)

    policy_loss = functional.cross_entropy(pred_policies, target_policies)
    value_loss = functional.mse_loss(pred_values, target_values)
    l2_norm = sum((parameter**2).sum() for parameter in network.parameters())

    return policy_loss + value_loss + l2_weight_decay * l2_norm


def train_step(
    network: PolicyValueNetwork,
    optimizer: torch.optim.Optimizer,
    batch: TrainingBatch,
    l2_weight_decay: float = L2_WEIGHT_DECAY,
) -> float:
    """1バッチ分の学習ステップ（損失計算・逆伝播・パラメータ更新）を実行する。

    正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「学習ステップ」節。

    Args:
        network: 更新対象のネットワーク。
        optimizer: `network.parameters()` を管理するオプティマイザ。
        batch: `(boards, target_policies, target_values)` のタプル。
        l2_weight_decay: L2正則化の重み。

    Returns:
        このステップの合計損失値（スカラー）。
    """
    network.train()
    boards, target_policies, target_values = batch

    loss = compute_loss(network, boards, target_policies, target_values, l2_weight_decay)

    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    return float(loss.item())


def checkpoint_path(checkpoint_root: Path, board_size: int, games_played: int) -> Path:
    """チェックポイントファイルの保存先パスを組み立てる。

    `training/checkpoints/{board_size}/game_{n:06d}.pt` という正本の命名規約に従う
    （ルートディレクトリだけ引数で差し替えられるようにし、テストでは一時ディレクトリを
    渡して本番の `training/checkpoints/` を汚さないようにする）。

    Args:
        checkpoint_root: チェックポイントのルートディレクトリ。
        board_size: 盤面の1辺のマス数。
        games_played: これまでに完了した自己対戦ゲーム数。

    Returns:
        `{checkpoint_root}/{board_size}/game_{games_played:06d}.pt` のパス。
    """
    return checkpoint_root / str(board_size) / f"game_{games_played:06d}.pt"


def save_checkpoint(
    network: PolicyValueNetwork, checkpoint_root: Path, board_size: int, games_played: int
) -> Path:
    """ネットワークの重みをチェックポイントファイルとして保存する。

    Args:
        network: 保存対象のネットワーク。
        checkpoint_root: チェックポイントのルートディレクトリ。
        board_size: 盤面の1辺のマス数。
        games_played: これまでに完了した自己対戦ゲーム数。

    Returns:
        実際に書き込んだファイルのパス。
    """
    path = checkpoint_path(checkpoint_root, board_size, games_played)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(network.state_dict(), path)
    return path


def parse_checkpoint_path(path: Path) -> tuple[int, int]:
    """`checkpoint_path` が組み立てたパスから `(board_size, games_played)` を復元する。

    学習再開（`run_training.run_training` の `resume_from`）で、チェックポイントの
    ファイル名からそれまでに完了した自己対戦ゲーム数を読み取るために使う。

    Args:
        path: `checkpoint_path` の命名規約（`{root}/{board_size}/game_{n:06d}.pt`）に
            従うチェックポイントファイルのパス。

    Returns:
        `(board_size, games_played)` のタプル。

    Raises:
        ValueError: パスが命名規約に従っていない場合。
    """
    try:
        board_size = int(path.parent.name)
        games_played = int(path.stem.removeprefix("game_"))
    except ValueError as error:
        raise ValueError(
            f"{path} does not follow the '{{board_size}}/game_{{n:06d}}.pt' naming convention"
        ) from error
    return board_size, games_played


def should_save_checkpoint(
    games_played: int, checkpoint_interval_games: int = CHECKPOINT_INTERVAL_GAMES
) -> bool:
    """`games_played` 局終わった時点でチェックポイントを保存すべきかどうかを判定する。

    Args:
        games_played: これまでに完了した自己対戦ゲーム数。
        checkpoint_interval_games: 保存間隔（ゲーム数）。

    Returns:
        `games_played` が正の値で `checkpoint_interval_games` の倍数なら `True`。
    """
    return games_played > 0 and games_played % checkpoint_interval_games == 0
