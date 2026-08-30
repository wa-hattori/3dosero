"""自己対戦によるデータ生成ループ。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「自己対戦ループ」節
（`play_self_play_game` の疑似コード）。

設計上の注記（SKILL.mdが厳密に定義していない部分の解釈）:

- `current_temperature(ply)` の `ply` は、パス（`continue` するだけの反復）を
  含まない「実際に石を置いた手数」の通し番号として実装する。SKILL.mdの疑似コードは
  `ply` の更新箇所を明示していないが、`TEMPERATURE_MOVE_THRESHOLD` が
  「この手数までサンプリング、以降は貪欲」と説明されていることと整合する解釈。
- `sample_or_argmax(policy)` は、`visit_counts_to_policy` が温度0のときに
  one-hot分布を返す設計にすることで、常に同じ「加重サンプリング」関数
  (`sample_move`) で argmax 相当の挙動も表現できるようにしている
  （one-hot分布からのサンプリングは必ずその1点を選ぶ）。
"""

from __future__ import annotations

import numpy as np
import torch

from training.board_encoding import encode_board
from training.config import TEMPERATURE_MOVE_THRESHOLD
from training.game_rules import (
    BLACK,
    apply_move,
    coords_from_index,
    create_initial_board,
    get_winner,
    has_valid_move,
    index_of,
    opposite_color,
)
from training.mcts import Move, mcts_search, terminal_value_for
from training.network import PolicyValueNetwork

SelfPlayExample = tuple[torch.Tensor, np.ndarray, float]


def current_temperature(
    ply: int, temperature_move_threshold: int = TEMPERATURE_MOVE_THRESHOLD
) -> float:
    """手数に応じた温度パラメータを返す。

    Args:
        ply: これまでに実際に石を置いた手数（0始まり）。
        temperature_move_threshold: この手数未満ならサンプリング、以降は貪欲にする閾値。

    Returns:
        `ply < temperature_move_threshold` なら `1.0`（サンプリング）、
        そうでなければ `0.0`（貪欲、`visit_counts_to_policy` がone-hotを返す）。
    """
    return 1.0 if ply < temperature_move_threshold else 0.0


def visit_counts_to_policy(
    visit_counts: dict[Move, float], temperature: float, board_size: int
) -> np.ndarray:
    """MCTSの訪問回数分布を、温度でスケーリングした学習用方策ベクトルに変換する。

    `visit_counts` は既に合計1に正規化された分布（`mcts.normalized_visit_counts`
    の出力）を想定するが、割合の温度スケーリングは元の生訪問回数に対して行うのと
    比例的に等価なため、正規化済みの値をそのまま使ってよい。

    Args:
        visit_counts: `{move: normalized_visit_count}`。
        temperature: `0.0` なら最頻訪問手のone-hot分布、それ以外は
            `visit_count ** (1 / temperature)` に比例する分布。
        board_size: 盤面の1辺のマス数。

    Returns:
        shape `(board_size ** 3,)` の確率分布（`index_of` 順）。合法手以外は`0.0`。
    """
    policy = np.zeros(board_size**3, dtype=np.float64)
    if not visit_counts:
        return policy

    if temperature <= 0.0:
        best_move = max(visit_counts.items(), key=lambda item: item[1])[0]
        policy[index_of(*best_move, board_size)] = 1.0
        return policy

    weights = {move: value ** (1.0 / temperature) for move, value in visit_counts.items()}
    total = sum(weights.values())

    if total <= 1e-12:
        uniform = 1.0 / len(visit_counts)
        for move in visit_counts:
            policy[index_of(*move, board_size)] = uniform
        return policy

    for move, weight in weights.items():
        policy[index_of(*move, board_size)] = weight / total

    return policy


def sample_move(policy: np.ndarray, board_size: int, rng: np.random.Generator) -> Move:
    """方策分布に従って1手をサンプリングする（`sample_or_argmax` に対応）。

    `visit_counts_to_policy` が温度0でone-hot分布を返すため、この関数だけで
    サンプリングとargmax相当の挙動の両方をカバーする。

    Args:
        policy: shape `(board_size ** 3,)` の確率分布（合計1）。
        board_size: 盤面の1辺のマス数。
        rng: 乱数生成器。

    Returns:
        サンプリングされた着手座標 `(x, y, z)`。
    """
    index = int(rng.choice(board_size**3, p=policy))
    return coords_from_index(index, board_size)


def play_self_play_game(
    network: PolicyValueNetwork,
    board_size: int,
    num_simulations: int,
    device: torch.device,
    temperature_move_threshold: int = TEMPERATURE_MOVE_THRESHOLD,
    rng: np.random.Generator | None = None,
) -> list[SelfPlayExample]:
    """1局分の自己対戦を行い、学習用のサンプル列を返す。

    正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「自己対戦ループ」節。

    Args:
        network: 自己対戦に使う方策/価値ネットワーク（両者とも同一インスタンス）。
        board_size: 盤面の1辺のマス数。
        num_simulations: 1手あたりのMCTSシミュレーション回数。
        device: 推論を実行するデバイス。
        temperature_move_threshold: この手数までサンプリング、以降は貪欲にする閾値。
        rng: 乱数生成器。省略時は新規生成する。

    Returns:
        `(encoded_board, policy, value)` のリスト。`value` は着手した色から見た
        終局結果（勝ち`1.0`・負け`-1.0`・引き分け`0.0`）。
    """
    rng = rng if rng is not None else np.random.default_rng()
    board = create_initial_board(board_size)
    color = BLACK
    history: list[tuple[torch.Tensor, np.ndarray, int]] = []
    ply = 0

    while True:
        if not has_valid_move(board, color, board_size):
            next_color = opposite_color(color)
            if not has_valid_move(board, next_color, board_size):
                break
            color = next_color
            continue

        visit_counts = mcts_search(
            board, color, network, board_size, num_simulations, device, rng=rng
        )
        temperature = current_temperature(ply, temperature_move_threshold)
        policy = visit_counts_to_policy(visit_counts, temperature, board_size)
        history.append((encode_board(board, color, board_size), policy, color))

        move = sample_move(policy, board_size, rng)
        board = apply_move(board, move[0], move[1], move[2], color, board_size)
        color = opposite_color(color)
        ply += 1

    winner = get_winner(board)
    return [
        (encoded, policy, terminal_value_for(winner, move_color))
        for encoded, policy, move_color in history
    ]
