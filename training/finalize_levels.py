"""チェックポイント群から強さ評価→レベル選定→ONNX書き出しまでを一括実行する。

`checkpoint_eval.evaluate_checkpoints` → `select_levels.select_levels` →
`export_onnx.export_checkpoint_to_onnx` を組み合わせたオーケストレーション。
正本: `.claude/skills/gan-cpu-self-play/SKILL.md`。レベル1は既存の
`chooseRandomMove`（JS側）を使うためこのスクリプトの対象外。選定した
レベル2〜(1+num_levels)（デフォルトはレベル2〜5）のチェックポイントを、
ブラウザ推論用に `{onnx_root}/{board_size}/level{N}.onnx` として書き出す。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch

from training.checkpoint_eval import evaluate_checkpoints
from training.config import (
    BASE_CHANNELS,
    ELO_BASE_RATING,
    ELO_K_FACTOR,
    GAMES_PER_MATCHUP,
    MCTS_SIMULATIONS_PER_MOVE,
    PUCT_C,
    RESIDUAL_BLOCKS,
)
from training.export_onnx import export_checkpoint_to_onnx
from training.select_levels import select_levels

FIRST_TRAINED_LEVEL = 2
DEFAULT_NUM_LEVELS = 4
DEFAULT_ONNX_ROOT = Path("data/models")


def finalize_levels(
    checkpoint_paths: list[Path],
    board_size: int,
    device: torch.device,
    onnx_root: Path = DEFAULT_ONNX_ROOT,
    num_simulations: int = MCTS_SIMULATIONS_PER_MOVE,
    games_per_matchup: int = GAMES_PER_MATCHUP,
    num_residual_blocks: int = RESIDUAL_BLOCKS,
    base_channels: int = BASE_CHANNELS,
    puct_c: float = PUCT_C,
    k_factor: float = ELO_K_FACTOR,
    base_rating: float = ELO_BASE_RATING,
    num_levels: int = DEFAULT_NUM_LEVELS,
    rng: np.random.Generator | None = None,
    log_fn=print,
) -> dict[int, Path]:
    """チェックポイント群を評価し、レベル2〜(1+num_levels)に対応するONNXを書き出す。

    Args:
        checkpoint_paths: 評価対象チェックポイントのパス一覧（`num_levels`件以上必要）。
        board_size: 盤面の1辺のマス数。
        device: 推論を実行するデバイス。
        onnx_root: ONNXの書き出し先ルートディレクトリ。
        num_simulations: 評価対局1手あたりのMCTSシミュレーション回数。
        games_per_matchup: 1対戦カードあたりの対局数。
        num_residual_blocks: チェックポイントのネットワーク構成。
        base_channels: チェックポイントのネットワーク構成。
        puct_c: PUCT定数。
        k_factor: Eloの更新幅係数。
        base_rating: Eloの初期レーティング。
        num_levels: 選定するレベル数（レベル2から始まる）。
        rng: 乱数生成器。省略時は新規生成する。
        log_fn: 進捗ログの出力先関数。

    Returns:
        `{level_number: onnx_path}`（`level_number`は`FIRST_TRAINED_LEVEL`から昇順）。
    """
    rng = rng if rng is not None else np.random.default_rng()
    log_fn(f"evaluating {len(checkpoint_paths)} checkpoints for board_size={board_size}...")

    ratings = evaluate_checkpoints(
        checkpoint_paths,
        board_size,
        games_per_matchup,
        num_simulations,
        device,
        rng,
        num_residual_blocks,
        base_channels,
        puct_c,
        k_factor,
        base_rating,
    )
    for checkpoint_id, rating in sorted(ratings.items(), key=lambda item: item[1]):
        log_fn(f"  rating={rating:.1f} {checkpoint_id}")

    selected_ids = select_levels(ratings, num_levels)
    id_to_path = {str(path): path for path in checkpoint_paths}

    exported: dict[int, Path] = {}
    for offset, checkpoint_id in enumerate(selected_ids):
        level = FIRST_TRAINED_LEVEL + offset
        checkpoint_path = id_to_path[checkpoint_id]
        onnx_path = onnx_root / str(board_size) / f"level{level}.onnx"
        export_checkpoint_to_onnx(
            checkpoint_path, onnx_path, board_size, device, num_residual_blocks, base_channels
        )
        log_fn(
            f"level{level}: {checkpoint_path} (rating={ratings[checkpoint_id]:.1f}) -> {onnx_path}"
        )
        exported[level] = onnx_path

    return exported


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate checkpoints via Elo, select levels 2-5, and export to ONNX."
    )
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--board-size", type=int, required=True)
    parser.add_argument("--onnx-root", type=Path, default=DEFAULT_ONNX_ROOT)
    parser.add_argument("--num-simulations", type=int, default=MCTS_SIMULATIONS_PER_MOVE)
    parser.add_argument("--games-per-matchup", type=int, default=GAMES_PER_MATCHUP)
    parser.add_argument("--seed", type=int, default=0)
    return parser.parse_args()


def main() -> None:
    """CLIエントリポイント。

    `python -m training.finalize_levels --checkpoint-dir training/checkpoints/8 --board-size 8`
    """
    args = _parse_args()
    checkpoint_paths = sorted(args.checkpoint_dir.glob("game_*.pt"))
    if not checkpoint_paths:
        raise SystemExit(f"no checkpoints found under {args.checkpoint_dir}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    rng = np.random.default_rng(args.seed)
    finalize_levels(
        checkpoint_paths,
        args.board_size,
        device,
        onnx_root=args.onnx_root,
        num_simulations=args.num_simulations,
        games_per_matchup=args.games_per_matchup,
        rng=rng,
    )


if __name__ == "__main__":
    main()
