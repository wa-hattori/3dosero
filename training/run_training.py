"""GAN CPU対戦相手の学習を実行するオーケストレーションスクリプト。

`self_play.play_self_play_game` → リプレイバッファ蓄積 → `train.train_step` →
`train.should_save_checkpoint`/`save_checkpoint` の各部品を組み合わせて、実際の
自己対戦→学習→チェックポイント保存ループを回す。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md`。学習ループ本体は
([testing.md](../.claude/rules/common/testing.md) の方針により)自動テスト対象外。
軽量なスモークテスト（数局・小盤面・少シミュレーション回数）のみ用意する。

設計上の注記（SKILL.mdが厳密に定義していない、オーケストレーション層の判断）:

- リプレイバッファはFIFO（古いサンプルから破棄）の固定容量バッファとする。
- 1局終えるごとに `train_steps_per_game` 回の学習ステップを回す（自己対戦と学習を
  交互に行う、AlphaZero系実装で一般的な構成）。バッファが小さすぎる間
  （`min(batch_size, 32)` 未満）は学習をスキップし、初期の偏ったデータで
  学習が不安定化するのを避ける。
"""

from __future__ import annotations

import argparse
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch

from training.config import (
    BASE_CHANNELS,
    BATCH_SIZE,
    CHECKPOINT_INTERVAL_GAMES,
    L2_WEIGHT_DECAY,
    LEARNING_RATE,
    MCTS_SIMULATIONS_PER_MOVE,
    RESIDUAL_BLOCKS,
    TEMPERATURE_MOVE_THRESHOLD,
)
from training.network import PolicyValueNetwork
from training.self_play import SelfPlayExample, play_self_play_game
from training.train import save_checkpoint, should_save_checkpoint, train_step

DEFAULT_CHECKPOINT_ROOT = Path("training/checkpoints")
DEFAULT_REPLAY_BUFFER_CAPACITY = 20000
DEFAULT_TRAIN_STEPS_PER_GAME = 4
MIN_BUFFER_SIZE_BEFORE_TRAINING = 32


@dataclass
class ReplayBuffer:
    """自己対戦サンプルを保持するFIFO固定容量バッファ。"""

    capacity: int
    examples: list[SelfPlayExample] = field(default_factory=list)

    def add_game(self, examples: list[SelfPlayExample]) -> None:
        """1局分のサンプルを追加し、容量を超えた分は古いものから破棄する。

        Args:
            examples: 追加するサンプル列。
        """
        self.examples.extend(examples)
        overflow = len(self.examples) - self.capacity
        if overflow > 0:
            del self.examples[:overflow]

    def sample_batch(self, batch_size: int, rng: np.random.Generator) -> list[SelfPlayExample]:
        """バッファからランダムに(重複なく)サンプルを取り出す。

        Args:
            batch_size: 取り出す件数の上限（バッファがそれより小さければ全件）。
            rng: 乱数生成器。

        Returns:
            サンプルのリスト。
        """
        size = min(batch_size, len(self.examples))
        indices = rng.choice(len(self.examples), size=size, replace=False)
        return [self.examples[index] for index in indices]

    def __len__(self) -> int:
        return len(self.examples)


def examples_to_batch(
    examples: list[SelfPlayExample], device: torch.device
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """自己対戦サンプル列を`train_step`が受け取るバッチテンソルに変換する。

    Args:
        examples: `(encoded_board, policy, value)` のリスト。
        device: 変換後のテンソルを配置するデバイス。

    Returns:
        `(boards, target_policies, target_values)` のタプル。
    """
    boards = torch.stack([board for board, _policy, _value in examples]).float().to(device)
    policies = (
        torch.from_numpy(np.stack([policy for _board, policy, _value in examples]))
        .float()
        .to(device)
    )
    values = torch.tensor(
        [value for _board, _policy, value in examples], dtype=torch.float32, device=device
    ).unsqueeze(1)
    return boards, policies, values


def run_training(
    board_size: int,
    total_games: int,
    num_simulations: int,
    device: torch.device,
    checkpoint_root: Path = DEFAULT_CHECKPOINT_ROOT,
    checkpoint_interval_games: int = CHECKPOINT_INTERVAL_GAMES,
    batch_size: int = BATCH_SIZE,
    learning_rate: float = LEARNING_RATE,
    l2_weight_decay: float = L2_WEIGHT_DECAY,
    num_residual_blocks: int = RESIDUAL_BLOCKS,
    base_channels: int = BASE_CHANNELS,
    temperature_move_threshold: int = TEMPERATURE_MOVE_THRESHOLD,
    train_steps_per_game: int = DEFAULT_TRAIN_STEPS_PER_GAME,
    replay_buffer_capacity: int = DEFAULT_REPLAY_BUFFER_CAPACITY,
    rng: np.random.Generator | None = None,
    log_fn: Callable[[str], None] = print,
) -> Path:
    """自己対戦→学習→チェックポイント保存ループを実行する。

    Args:
        board_size: 盤面の1辺のマス数。
        total_games: 実行する自己対戦ゲーム数。
        num_simulations: 1手あたりのMCTSシミュレーション回数。
        device: 推論・学習を実行するデバイス。
        checkpoint_root: チェックポイントの保存先ルートディレクトリ。
        checkpoint_interval_games: チェックポイント保存間隔（ゲーム数）。
        batch_size: 1学習ステップあたりのバッチサイズ。
        learning_rate: Adamオプティマイザの学習率。
        l2_weight_decay: L2正則化の重み。
        num_residual_blocks: ネットワークの残差ブロック数。
        base_channels: ネットワークのStem/残差ブロックのチャンネル数。
        temperature_move_threshold: 自己対戦でサンプリングから貪欲に切り替える手数。
        train_steps_per_game: 1局終えるごとに実行する学習ステップ数。
        replay_buffer_capacity: リプレイバッファの最大保持サンプル数。
        rng: 乱数生成器。省略時は新規生成する。
        log_fn: 進捗ログの出力先関数（デフォルトは`print`）。

    Returns:
        最後に保存されたチェックポイントのパス（`total_games`終了時点で
        `checkpoint_interval_games`の倍数でなければ、最終状態を追加で保存する）。
    """
    rng = rng if rng is not None else np.random.default_rng()
    network = PolicyValueNetwork(board_size, num_residual_blocks, base_channels).to(device)
    optimizer = torch.optim.Adam(network.parameters(), lr=learning_rate)
    buffer = ReplayBuffer(capacity=replay_buffer_capacity)

    last_checkpoint_path: Path | None = None
    last_checkpoint_games: int | None = None

    for games_played in range(1, total_games + 1):
        start = time.monotonic()
        network.eval()
        examples = play_self_play_game(
            network, board_size, num_simulations, device, temperature_move_threshold, rng
        )
        buffer.add_game(examples)
        elapsed_self_play = time.monotonic() - start

        losses: list[float] = []
        if len(buffer) >= min(batch_size, MIN_BUFFER_SIZE_BEFORE_TRAINING):
            network.train()
            for _ in range(train_steps_per_game):
                batch_examples = buffer.sample_batch(batch_size, rng)
                batch = examples_to_batch(batch_examples, device)
                losses.append(train_step(network, optimizer, batch, l2_weight_decay))

        avg_loss = sum(losses) / len(losses) if losses else float("nan")
        log_fn(
            f"game={games_played}/{total_games} moves={len(examples)} "
            f"buffer={len(buffer)} avg_loss={avg_loss:.4f} "
            f"self_play_sec={elapsed_self_play:.1f}"
        )

        if should_save_checkpoint(games_played, checkpoint_interval_games):
            last_checkpoint_path = save_checkpoint(
                network, checkpoint_root, board_size, games_played
            )
            last_checkpoint_games = games_played
            log_fn(f"saved checkpoint: {last_checkpoint_path}")

    if last_checkpoint_games != total_games:
        last_checkpoint_path = save_checkpoint(network, checkpoint_root, board_size, total_games)
        log_fn(f"saved final checkpoint: {last_checkpoint_path}")

    assert last_checkpoint_path is not None
    return last_checkpoint_path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run GAN CPU self-play training.")
    parser.add_argument("--board-size", type=int, required=True)
    parser.add_argument("--total-games", type=int, required=True)
    parser.add_argument("--num-simulations", type=int, default=MCTS_SIMULATIONS_PER_MOVE)
    parser.add_argument("--checkpoint-interval-games", type=int, default=CHECKPOINT_INTERVAL_GAMES)
    parser.add_argument("--checkpoint-root", type=Path, default=DEFAULT_CHECKPOINT_ROOT)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--seed", type=int, default=0)
    return parser.parse_args()


def main() -> None:
    """CLIエントリポイント。`python -m training.run_training --board-size 8 --total-games 100`。"""
    args = _parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    rng = np.random.default_rng(args.seed)
    run_training(
        board_size=args.board_size,
        total_games=args.total_games,
        num_simulations=args.num_simulations,
        device=device,
        checkpoint_root=args.checkpoint_root,
        checkpoint_interval_games=args.checkpoint_interval_games,
        batch_size=args.batch_size,
        rng=rng,
    )


if __name__ == "__main__":
    main()
