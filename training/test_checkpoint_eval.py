"""checkpoint_eval.py のユニットテスト。

正本: .claude/skills/gan-cpu-self-play/SKILL.md の
「強さ評価とレベル選定（Elo的指標）」節（`evaluate_checkpoints` の疑似コード）。
`play_match`/`evaluate_checkpoints` はMCTS込みのネットワーク評価を伴うためCUDAデバイス上で
実行して検証する（本プロジェクトのGPUテスト方針）。`load_network_from_checkpoint` は
state_dictのロードのみで前方伝播を伴わないため、CPUデバイスでも検証できる。
"""

from pathlib import Path

import numpy as np
import pytest
import torch

from training.checkpoint_eval import (
    _score_for_network_a,
    evaluate_checkpoints,
    load_network_from_checkpoint,
    play_match,
    sample_matchups,
)
from training.config import ELO_BASE_RATING
from training.game_rules import BLACK, WHITE
from training.network import PolicyValueNetwork
from training.train import save_checkpoint

CUDA_REQUIRED_REASON = (
    "CUDA is required to validate GPU-backed checkpoint evaluation per project policy"
)

# テスト側のローカル定数。本番用の目安値(training/config.py)より大幅に小さくする。
TEST_BOARD_SIZE = 4
TEST_NUM_SIMULATIONS = 4
TEST_NUM_RESIDUAL_BLOCKS = 1
TEST_BASE_CHANNELS = 4
TEST_GAMES_PER_MATCHUP = 1


@pytest.fixture
def cuda_device() -> torch.device:
    if not torch.cuda.is_available():
        pytest.skip(CUDA_REQUIRED_REASON)
    return torch.device("cuda")


def make_small_network(board_size: int, seed: int) -> PolicyValueNetwork:
    torch.manual_seed(seed)
    return PolicyValueNetwork(
        board_size=board_size,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )


# --- load_network_from_checkpoint ---


def test_load_network_from_checkpoint_round_trips_saved_weights(tmp_path: Path) -> None:
    device = torch.device("cpu")
    network = make_small_network(TEST_BOARD_SIZE, seed=0)
    saved_path = save_checkpoint(network, tmp_path, board_size=TEST_BOARD_SIZE, games_played=200)

    loaded = load_network_from_checkpoint(
        saved_path,
        TEST_BOARD_SIZE,
        device,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )

    for original, reloaded in zip(
        network.state_dict().values(), loaded.state_dict().values(), strict=True
    ):
        assert torch.equal(original, reloaded.cpu())


def test_load_network_from_checkpoint_returns_a_network_in_eval_mode(tmp_path: Path) -> None:
    device = torch.device("cpu")
    network = make_small_network(TEST_BOARD_SIZE, seed=1)
    saved_path = save_checkpoint(network, tmp_path, board_size=TEST_BOARD_SIZE, games_played=200)

    loaded = load_network_from_checkpoint(
        saved_path,
        TEST_BOARD_SIZE,
        device,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )

    assert loaded.training is False


# --- sample_matchups (pure) ---


def test_sample_matchups_returns_empty_for_fewer_than_two_checkpoints() -> None:
    rng = np.random.default_rng(0)

    assert sample_matchups([], rng) == []
    assert sample_matchups(["only-one"], rng) == []


def test_sample_matchups_returns_the_only_pair_for_two_checkpoints() -> None:
    rng = np.random.default_rng(0)

    matchups = sample_matchups(["a", "b"], rng)

    assert matchups == [("a", "b")] or matchups == [("b", "a")]


def test_sample_matchups_never_pairs_a_checkpoint_with_itself() -> None:
    rng = np.random.default_rng(0)
    checkpoint_ids = ["a", "b", "c", "d"]

    matchups = sample_matchups(checkpoint_ids, rng, num_opponents_per_checkpoint=3)

    for checkpoint_a, checkpoint_b in matchups:
        assert checkpoint_a != checkpoint_b


def test_sample_matchups_covers_every_checkpoint_at_least_once() -> None:
    rng = np.random.default_rng(0)
    checkpoint_ids = ["a", "b", "c", "d", "e"]

    matchups = sample_matchups(checkpoint_ids, rng, num_opponents_per_checkpoint=1)

    involved = {checkpoint_id for pair in matchups for checkpoint_id in pair}
    assert involved == set(checkpoint_ids)


def test_sample_matchups_is_effectively_round_robin_for_small_pools() -> None:
    rng = np.random.default_rng(0)
    checkpoint_ids = ["a", "b", "c", "d"]

    matchups = sample_matchups(checkpoint_ids, rng, num_opponents_per_checkpoint=3)

    assert len(matchups) == 6  # C(4, 2) full round robin


def test_sample_matchups_produces_fewer_than_round_robin_pairs_for_large_pools() -> None:
    rng = np.random.default_rng(0)
    checkpoint_ids = [f"checkpoint-{i}" for i in range(8)]

    matchups = sample_matchups(checkpoint_ids, rng, num_opponents_per_checkpoint=2)

    full_round_robin_pair_count = 8 * 7 // 2
    assert len(matchups) < full_round_robin_pair_count


# --- _score_for_network_a (pure) ---


def test_score_for_network_a_is_one_when_its_color_wins() -> None:
    assert _score_for_network_a(winner_color=BLACK, network_a_color=BLACK) == 1.0


def test_score_for_network_a_is_zero_when_the_opponent_color_wins() -> None:
    assert _score_for_network_a(winner_color=WHITE, network_a_color=BLACK) == 0.0


def test_score_for_network_a_is_half_on_a_draw() -> None:
    assert _score_for_network_a(winner_color=None, network_a_color=BLACK) == 0.5


# --- play_match (CUDA smoke test) ---


def test_play_match_returns_a_valid_winner_or_none(cuda_device: torch.device) -> None:
    network_a = make_small_network(TEST_BOARD_SIZE, seed=0).to(cuda_device)
    network_b = make_small_network(TEST_BOARD_SIZE, seed=1).to(cuda_device)
    rng = np.random.default_rng(0)

    winner = play_match(
        network_a,
        network_b,
        TEST_BOARD_SIZE,
        TEST_NUM_SIMULATIONS,
        cuda_device,
        first_player=network_a,
        rng=rng,
    )

    assert winner in (BLACK, WHITE, None)


def test_play_match_accepts_network_b_as_first_player(cuda_device: torch.device) -> None:
    network_a = make_small_network(TEST_BOARD_SIZE, seed=0).to(cuda_device)
    network_b = make_small_network(TEST_BOARD_SIZE, seed=1).to(cuda_device)
    rng = np.random.default_rng(0)

    winner = play_match(
        network_a,
        network_b,
        TEST_BOARD_SIZE,
        TEST_NUM_SIMULATIONS,
        cuda_device,
        first_player=network_b,
        rng=rng,
    )

    assert winner in (BLACK, WHITE, None)


def test_play_match_raises_when_first_player_is_neither_network(cuda_device: torch.device) -> None:
    network_a = make_small_network(TEST_BOARD_SIZE, seed=0).to(cuda_device)
    network_b = make_small_network(TEST_BOARD_SIZE, seed=1).to(cuda_device)
    unrelated_network = make_small_network(TEST_BOARD_SIZE, seed=2).to(cuda_device)
    rng = np.random.default_rng(0)

    with pytest.raises(ValueError, match="first_player"):
        play_match(
            network_a,
            network_b,
            TEST_BOARD_SIZE,
            TEST_NUM_SIMULATIONS,
            cuda_device,
            first_player=unrelated_network,
            rng=rng,
        )


# --- evaluate_checkpoints (CUDA smoke test) ---


def test_evaluate_checkpoints_includes_every_checkpoint_in_the_result(
    cuda_device: torch.device, tmp_path: Path
) -> None:
    checkpoint_paths = [
        save_checkpoint(
            make_small_network(TEST_BOARD_SIZE, seed=seed),
            tmp_path,
            board_size=TEST_BOARD_SIZE,
            games_played=(seed + 1) * 200,
        )
        for seed in range(3)
    ]
    rng = np.random.default_rng(0)

    ratings = evaluate_checkpoints(
        checkpoint_paths,
        TEST_BOARD_SIZE,
        games_per_matchup=TEST_GAMES_PER_MATCHUP,
        num_simulations=TEST_NUM_SIMULATIONS,
        device=cuda_device,
        rng=rng,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )

    assert set(ratings.keys()) == {str(path) for path in checkpoint_paths}
    assert all(np.isfinite(rating) for rating in ratings.values())


def test_evaluate_checkpoints_keeps_total_rating_mass_constant(
    cuda_device: torch.device, tmp_path: Path
) -> None:
    # Elo更新はペアごとにゼロサムなので、全チェックポイントのレーティング合計は
    # 何局対局しても初期値の合計から変化しないはずである。
    checkpoint_paths = [
        save_checkpoint(
            make_small_network(TEST_BOARD_SIZE, seed=seed),
            tmp_path,
            board_size=TEST_BOARD_SIZE,
            games_played=(seed + 1) * 200,
        )
        for seed in range(3)
    ]
    rng = np.random.default_rng(1)

    ratings = evaluate_checkpoints(
        checkpoint_paths,
        TEST_BOARD_SIZE,
        games_per_matchup=TEST_GAMES_PER_MATCHUP,
        num_simulations=TEST_NUM_SIMULATIONS,
        device=cuda_device,
        rng=rng,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )

    assert sum(ratings.values()) == pytest.approx(len(checkpoint_paths) * ELO_BASE_RATING, abs=1e-6)


def test_evaluate_checkpoints_returns_base_rating_for_a_single_checkpoint(
    cuda_device: torch.device, tmp_path: Path
) -> None:
    saved_path = save_checkpoint(
        make_small_network(TEST_BOARD_SIZE, seed=0),
        tmp_path,
        board_size=TEST_BOARD_SIZE,
        games_played=200,
    )
    rng = np.random.default_rng(0)

    ratings = evaluate_checkpoints(
        [saved_path],
        TEST_BOARD_SIZE,
        games_per_matchup=TEST_GAMES_PER_MATCHUP,
        num_simulations=TEST_NUM_SIMULATIONS,
        device=cuda_device,
        rng=rng,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )

    assert ratings == {str(saved_path): ELO_BASE_RATING}
