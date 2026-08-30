"""self_play.py のユニットテスト。

正本: .claude/skills/gan-cpu-self-play/SKILL.md の「自己対戦ループ」節。
`play_self_play_game` はMCTS・ネットワーク評価を伴うためCUDAデバイス上で実行して
検証する（本プロジェクトのGPUテスト方針）。
"""

import numpy as np
import pytest
import torch

from training.game_rules import index_of
from training.network import PolicyValueNetwork
from training.self_play import (
    current_temperature,
    play_self_play_game,
    sample_move,
    visit_counts_to_policy,
)

CUDA_REQUIRED_REASON = "CUDA is required to validate GPU-backed self-play per project policy"

# テスト側のローカル定数。本番用の目安値(training/config.py)より大幅に小さくする。
TEST_BOARD_SIZE = 4
TEST_NUM_SIMULATIONS = 8
TEST_NUM_RESIDUAL_BLOCKS = 1
TEST_BASE_CHANNELS = 8
TEST_TEMPERATURE_MOVE_THRESHOLD = 2


@pytest.fixture
def cuda_device() -> torch.device:
    if not torch.cuda.is_available():
        pytest.skip(CUDA_REQUIRED_REASON)
    return torch.device("cuda")


# --- current_temperature ---


def test_current_temperature_is_one_before_threshold() -> None:
    assert current_temperature(0, temperature_move_threshold=8) == 1.0
    assert current_temperature(7, temperature_move_threshold=8) == 1.0


def test_current_temperature_is_zero_at_and_after_threshold() -> None:
    assert current_temperature(8, temperature_move_threshold=8) == 0.0
    assert current_temperature(20, temperature_move_threshold=8) == 0.0


# --- visit_counts_to_policy ---


def test_visit_counts_to_policy_is_one_hot_at_zero_temperature() -> None:
    board_size = 4
    visit_counts = {(0, 0, 0): 0.3, (1, 0, 0): 0.7}

    policy = visit_counts_to_policy(visit_counts, temperature=0.0, board_size=board_size)

    assert policy.sum() == pytest.approx(1.0)
    assert policy[index_of(1, 0, 0, board_size)] == 1.0
    assert policy[index_of(0, 0, 0, board_size)] == 0.0


def test_visit_counts_to_policy_at_temperature_one_matches_input_distribution() -> None:
    board_size = 4
    visit_counts = {(0, 0, 0): 0.3, (1, 0, 0): 0.7}

    policy = visit_counts_to_policy(visit_counts, temperature=1.0, board_size=board_size)

    assert policy[index_of(0, 0, 0, board_size)] == pytest.approx(0.3)
    assert policy[index_of(1, 0, 0, board_size)] == pytest.approx(0.7)


def test_visit_counts_to_policy_sharpens_distribution_below_temperature_one() -> None:
    board_size = 4
    visit_counts = {(0, 0, 0): 0.3, (1, 0, 0): 0.7}

    policy = visit_counts_to_policy(visit_counts, temperature=0.5, board_size=board_size)

    assert policy[index_of(1, 0, 0, board_size)] > 0.7


def test_visit_counts_to_policy_only_assigns_mass_to_given_moves() -> None:
    board_size = 4
    visit_counts = {(0, 0, 0): 1.0}

    policy = visit_counts_to_policy(visit_counts, temperature=1.0, board_size=board_size)

    assert np.count_nonzero(policy) == 1


def test_visit_counts_to_policy_returns_all_zero_for_empty_input() -> None:
    board_size = 4

    policy = visit_counts_to_policy({}, temperature=1.0, board_size=board_size)

    assert policy.shape == (board_size**3,)
    assert np.count_nonzero(policy) == 0


# --- sample_move ---


def test_sample_move_returns_the_only_move_for_a_one_hot_policy() -> None:
    board_size = 4
    policy = np.zeros(board_size**3, dtype=np.float64)
    policy[index_of(2, 1, 3, board_size)] = 1.0
    rng = np.random.default_rng(0)

    move = sample_move(policy, board_size, rng)

    assert move == (2, 1, 3)


def test_sample_move_only_returns_moves_with_positive_probability() -> None:
    board_size = 4
    policy = np.zeros(board_size**3, dtype=np.float64)
    policy[index_of(0, 0, 0, board_size)] = 0.5
    policy[index_of(1, 0, 0, board_size)] = 0.5
    rng = np.random.default_rng(1)

    for _ in range(20):
        move = sample_move(policy, board_size, rng)
        assert move in {(0, 0, 0), (1, 0, 0)}


# --- play_self_play_game (CUDA smoke test) ---


def test_play_self_play_game_produces_consistent_training_examples(
    cuda_device: torch.device,
) -> None:
    board_size = TEST_BOARD_SIZE
    network = PolicyValueNetwork(
        board_size=board_size,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    ).to(cuda_device)
    rng = np.random.default_rng(0)

    examples = play_self_play_game(
        network,
        board_size,
        TEST_NUM_SIMULATIONS,
        cuda_device,
        temperature_move_threshold=TEST_TEMPERATURE_MOVE_THRESHOLD,
        rng=rng,
    )

    assert len(examples) > 0
    for encoded_board, policy, value in examples:
        assert encoded_board.shape == (2, board_size, board_size, board_size)
        assert policy.shape == (board_size**3,)
        assert policy.sum() == pytest.approx(1.0, abs=1e-4)
        assert np.all(policy >= 0.0)
        assert value in (-1.0, 0.0, 1.0)


def test_play_self_play_game_is_bounded_by_the_maximum_number_of_cells(
    cuda_device: torch.device,
) -> None:
    board_size = TEST_BOARD_SIZE
    network = PolicyValueNetwork(
        board_size=board_size,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    ).to(cuda_device)
    rng = np.random.default_rng(1)

    examples = play_self_play_game(
        network,
        board_size,
        TEST_NUM_SIMULATIONS,
        cuda_device,
        temperature_move_threshold=TEST_TEMPERATURE_MOVE_THRESHOLD,
        rng=rng,
    )

    assert len(examples) <= board_size**3
