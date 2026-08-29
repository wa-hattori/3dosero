"""チェックポイント同士の対局によるElo評価。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「強さ評価とレベル選定（Elo的指標）」節
（`evaluate_checkpoints` の疑似コード）。

設計上の注記（SKILL.mdが厳密に定義していない部分の解釈）:

- `sampled_matchups(checkpoints)` は「全ペアではなくサンプリングする」という設計意図を
  実装で示すため、各チェックポイントにつき `num_opponents_per_checkpoint` 件の対戦相手を
  重複なくランダムに選ぶ `sample_matchups` として実装する。チェックポイント総数が
  `num_opponents_per_checkpoint + 1` 以下の場合は、選べる相手が総当たり分しかないため
  結果的に総当たりになる（SKILL.mdが許容している挙動）。
- `play_match` の `first_player` 引数は `network_a`/`network_b` のいずれかのネットワーク
  インスタンスをそのまま渡す設計にした。このゲームは常に `BLACK` が先手（`game_rules`/
  自己対戦ループと同じ規約）のため、「先手を務めるネットワーク」を指定することが
  そのまま先後入れ替えの実装になる。
- チェックポイントのID（Eloレーティング辞書のキー）には `checkpoint_paths` の各要素の
  `str(path)` をそのまま使う（`train.checkpoint_path` の命名規約により盤面サイズ・
  ゲーム数を含む一意なパスになるため）。
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np
import torch

from training.config import BASE_CHANNELS, ELO_BASE_RATING, ELO_K_FACTOR, PUCT_C, RESIDUAL_BLOCKS
from training.elo import update_elo_pair
from training.game_rules import (
    BLACK,
    WHITE,
    apply_move,
    create_initial_board,
    get_winner,
    has_valid_move,
    opposite_color,
)
from training.mcts import mcts_search
from training.network import PolicyValueNetwork
from training.self_play import sample_move, visit_counts_to_policy

DEFAULT_NUM_OPPONENTS_PER_CHECKPOINT = 3
MATCH_TEMPERATURE = 0.0
"""強さ評価の対局で使う温度。SKILL.md: 「探索には...温度0（貪欲）を使う」。"""


def load_network_from_checkpoint(
    path: Path,
    board_size: int,
    device: torch.device,
    num_residual_blocks: int = RESIDUAL_BLOCKS,
    base_channels: int = BASE_CHANNELS,
) -> PolicyValueNetwork:
    """`train.save_checkpoint` が書き出したチェックポイントからネットワークを復元する。

    Args:
        path: チェックポイントファイルのパス。
        board_size: 盤面の1辺のマス数（チェックポイント保存時と一致させること）。
        device: ロード後にネットワークを配置するデバイス。
        num_residual_blocks: 残差ブロック数（チェックポイント保存時と一致させること）。
        base_channels: Stem/残差ブロックのチャンネル数（チェックポイント保存時と一致させること）。

    Returns:
        重みロード済み・評価モード（`eval()`）・`device` 上に配置されたネットワーク。
    """
    network = PolicyValueNetwork(
        board_size=board_size,
        num_residual_blocks=num_residual_blocks,
        base_channels=base_channels,
    )
    state_dict = torch.load(path, map_location=device, weights_only=True)
    network.load_state_dict(state_dict)
    network.to(device)
    network.eval()
    return network


def play_match(
    network_a: PolicyValueNetwork,
    network_b: PolicyValueNetwork,
    board_size: int,
    num_simulations: int,
    device: torch.device,
    first_player: PolicyValueNetwork,
    puct_c: float = PUCT_C,
    rng: np.random.Generator | None = None,
) -> int | None:
    """`network_a` と `network_b` を1局対局させ、勝者の色を返す。

    正本: SKILL.mdの「強さ評価とレベル選定」節。探索ノイズなし（`add_noise=False`）・
    温度0（貪欲）のMCTSで着手を選ぶ（学習時の自己対戦とは異なる設定）。

    Args:
        network_a: 対局者の一方。
        network_b: 対局者のもう一方。
        board_size: 盤面の1辺のマス数。
        num_simulations: 1手あたりのMCTSシミュレーション回数。
        device: 推論を実行するデバイス。
        first_player: 先手（`BLACK`、必ず先に着手する）を務めるネットワーク。
            `network_a` か `network_b` のいずれかを渡す。先後を入れ替えて対局する際は
            呼び出し側がこの引数を切り替える。
        puct_c: PUCT定数。
        rng: 乱数生成器。省略時は新規生成する。

    Returns:
        勝者の色（`BLACK`/`WHITE`）。引き分けなら `None`。

    Raises:
        ValueError: `first_player` が `network_a` にも `network_b` にも一致しない場合。
    """
    if first_player is network_a:
        networks_by_color = {BLACK: network_a, WHITE: network_b}
    elif first_player is network_b:
        networks_by_color = {BLACK: network_b, WHITE: network_a}
    else:
        raise ValueError("first_player must be network_a or network_b")

    rng = rng if rng is not None else np.random.default_rng()
    board = create_initial_board(board_size)
    color = BLACK

    while True:
        if not has_valid_move(board, color, board_size):
            next_color = opposite_color(color)
            if not has_valid_move(board, next_color, board_size):
                break
            color = next_color
            continue

        network = networks_by_color[color]
        visit_counts = mcts_search(
            board,
            color,
            network,
            board_size,
            num_simulations,
            device,
            puct_c=puct_c,
            add_noise=False,
            rng=rng,
        )
        policy = visit_counts_to_policy(visit_counts, MATCH_TEMPERATURE, board_size)
        move = sample_move(policy, board_size, rng)
        board = apply_move(board, move[0], move[1], move[2], color, board_size)
        color = opposite_color(color)

    return get_winner(board)


def sample_matchups(
    checkpoint_ids: Sequence[str],
    rng: np.random.Generator,
    num_opponents_per_checkpoint: int = DEFAULT_NUM_OPPONENTS_PER_CHECKPOINT,
) -> list[tuple[str, str]]:
    """対戦カード一覧をサンプリングする（総当たりを避けるための設計、SKILL.md参照）。

    各チェックポイントについて、他のチェックポイントの中から重複なく最大
    `num_opponents_per_checkpoint` 件をランダムに選ぶ。チェックポイント総数が
    `num_opponents_per_checkpoint + 1` 以下の場合は、選べる相手がそれしかないため
    結果的に総当たりになる。

    Args:
        checkpoint_ids: 評価対象チェックポイントのID一覧（2件未満なら対戦カードなし）。
        rng: 乱数生成器。
        num_opponents_per_checkpoint: 1チェックポイントあたりの対戦相手数の上限。

    Returns:
        重複のない `(checkpoint_a_id, checkpoint_b_id)` の対戦カード一覧。
    """
    if len(checkpoint_ids) < 2:
        return []

    matchups: set[frozenset[str]] = set()
    for checkpoint_id in checkpoint_ids:
        opponents = [candidate for candidate in checkpoint_ids if candidate != checkpoint_id]
        num_opponents = min(num_opponents_per_checkpoint, len(opponents))
        chosen_indices = rng.choice(len(opponents), size=num_opponents, replace=False)
        for index in chosen_indices:
            matchups.add(frozenset((checkpoint_id, opponents[int(index)])))

    return [tuple(pair) for pair in matchups]


def _score_for_network_a(winner_color: int | None, network_a_color: int) -> float:
    """`play_match` の勝者色から `network_a` 視点のEloスコアを計算する。

    Args:
        winner_color: `play_match` が返した勝者の色（引き分けなら `None`）。
        network_a_color: その対局で `network_a` が担っていた色。

    Returns:
        `network_a` が勝ちなら `1.0`、負けなら `0.0`、引き分けなら `0.5`。
    """
    if winner_color is None:
        return 0.5
    return 1.0 if winner_color == network_a_color else 0.0


def evaluate_checkpoints(
    checkpoint_paths: Sequence[Path],
    board_size: int,
    games_per_matchup: int,
    num_simulations: int,
    device: torch.device,
    rng: np.random.Generator,
    num_residual_blocks: int = RESIDUAL_BLOCKS,
    base_channels: int = BASE_CHANNELS,
    puct_c: float = PUCT_C,
    k_factor: float = ELO_K_FACTOR,
    base_rating: float = ELO_BASE_RATING,
    num_opponents_per_checkpoint: int = DEFAULT_NUM_OPPONENTS_PER_CHECKPOINT,
) -> dict[str, float]:
    """チェックポイント群を互いに対局させ、Eloレーティングを求める。

    正本: SKILL.mdの `evaluate_checkpoints` 疑似コード。

    Args:
        checkpoint_paths: 評価対象チェックポイントのパス一覧（2件未満なら対局は行われず、
            初期レーティングのまま返る）。
        board_size: 盤面の1辺のマス数。
        games_per_matchup: 1対戦カードあたりの対局数（SKILL.mdの目安値は `GAMES_PER_MATCHUP`）。
        num_simulations: 1手あたりのMCTSシミュレーション回数。
        device: 推論を実行するデバイス。
        rng: 乱数生成器（対戦カードのサンプリング・対局中のMCTSの両方に使う）。
        num_residual_blocks: チェックポイントのネットワーク構成（残差ブロック数）。
        base_channels: チェックポイントのネットワーク構成（チャンネル数）。
        puct_c: PUCT定数。
        k_factor: Eloの更新幅係数（SKILL.mdの目安値は `ELO_K_FACTOR`）。
        base_rating: 初期レーティング（SKILL.mdの目安値は `ELO_BASE_RATING`）。
        num_opponents_per_checkpoint: 対戦カードサンプリングの、1チェックポイントあたりの
            対戦相手数の上限（`sample_matchups` 参照）。

    Returns:
        `{checkpoint_id: elo_rating}`。`checkpoint_id` は `str(path)`。全チェックポイントが
        キーとして含まれる（対局が発生しなかったものは `base_rating` のまま）。
    """
    checkpoint_ids = [str(path) for path in checkpoint_paths]
    ratings: dict[str, float] = dict.fromkeys(checkpoint_ids, base_rating)
    networks = {
        checkpoint_id: load_network_from_checkpoint(
            path, board_size, device, num_residual_blocks, base_channels
        )
        for checkpoint_id, path in zip(checkpoint_ids, checkpoint_paths, strict=True)
    }

    matchups = sample_matchups(checkpoint_ids, rng, num_opponents_per_checkpoint)

    for checkpoint_a_id, checkpoint_b_id in matchups:
        network_a = networks[checkpoint_a_id]
        network_b = networks[checkpoint_b_id]

        for game_index in range(games_per_matchup):
            a_plays_black = game_index % 2 == 0
            first_player = network_a if a_plays_black else network_b

            winner_color = play_match(
                network_a,
                network_b,
                board_size,
                num_simulations,
                device,
                first_player=first_player,
                puct_c=puct_c,
                rng=rng,
            )

            network_a_color = BLACK if a_plays_black else WHITE
            score_a = _score_for_network_a(winner_color, network_a_color)

            new_rating_a, new_rating_b = update_elo_pair(
                ratings[checkpoint_a_id], ratings[checkpoint_b_id], score_a, k_factor
            )
            ratings[checkpoint_a_id] = new_rating_a
            ratings[checkpoint_b_id] = new_rating_b

    return ratings
