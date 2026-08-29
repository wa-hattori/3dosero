"""mcts.py のユニットテスト。

正本: .claude/skills/gan-cpu-self-play/SKILL.md の「MCTS（探索、疑似コード）」節。
ネットワーク評価を伴う部分（predict/mcts_search）はCUDAデバイス上で実行して検証する。
"""

import numpy as np
import pytest
import torch

from training.game_rules import (
    BLACK,
    WHITE,
    apply_move,
    create_initial_board,
    get_valid_moves,
    index_of,
)
from training.mcts import (
    MCTSNode,
    _evaluate_leaf,
    add_dirichlet_noise,
    expand,
    mcts_search,
    normalized_visit_counts,
    predict,
    select_child_by_puct,
    terminal_value_for,
)
from training.network import PolicyValueNetwork

CUDA_REQUIRED_REASON = "CUDA is required to validate GPU-backed MCTS evaluation per project policy"

# テスト側のローカル定数。本番用の目安値(training/config.py)より大幅に小さくする。
TEST_NUM_SIMULATIONS = 12
TEST_BOARD_SIZE = 4
TEST_NUM_RESIDUAL_BLOCKS = 1
TEST_BASE_CHANNELS = 8


@pytest.fixture
def cuda_device() -> torch.device:
    if not torch.cuda.is_available():
        pytest.skip(CUDA_REQUIRED_REASON)
    return torch.device("cuda")


def make_small_network(board_size: int) -> PolicyValueNetwork:
    return PolicyValueNetwork(
        board_size=board_size,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )


# --- MCTSNode ---


def test_mctsnode_is_not_expanded_when_no_children() -> None:
    node = MCTSNode(prior=1.0)

    assert node.is_expanded is False


def test_mctsnode_is_expanded_after_a_child_is_added() -> None:
    node = MCTSNode(prior=1.0)
    node.children[(0, 0, 0)] = MCTSNode(prior=0.5)

    assert node.is_expanded is True


def test_mctsnode_mean_value_is_zero_when_unvisited() -> None:
    node = MCTSNode(prior=1.0)

    assert node.mean_value == 0.0


def test_mctsnode_mean_value_averages_value_sum_over_visit_count() -> None:
    node = MCTSNode(prior=1.0, visit_count=4, value_sum=2.0)

    assert node.mean_value == 0.5


# --- terminal_value_for ---


def test_terminal_value_for_winner_matching_color_is_one() -> None:
    assert terminal_value_for(BLACK, BLACK) == 1.0


def test_terminal_value_for_winner_not_matching_color_is_minus_one() -> None:
    assert terminal_value_for(WHITE, BLACK) == -1.0


def test_terminal_value_for_draw_is_zero() -> None:
    assert terminal_value_for(None, BLACK) == 0.0


# --- expand ---


def test_expand_creates_children_only_for_legal_moves() -> None:
    board_size = TEST_BOARD_SIZE
    board = create_initial_board(board_size)
    node = MCTSNode(prior=1.0)
    policy_probs = np.full(board_size**3, 1.0 / board_size**3, dtype=np.float32)

    expand(node, board, BLACK, policy_probs, board_size)

    expected_moves = set(get_valid_moves(board, BLACK, board_size))
    assert set(node.children.keys()) == expected_moves


def test_expand_normalizes_priors_to_sum_to_one() -> None:
    board_size = TEST_BOARD_SIZE
    board = create_initial_board(board_size)
    node = MCTSNode(prior=1.0)
    rng = np.random.default_rng(0)
    policy_probs = rng.random(board_size**3).astype(np.float32)

    expand(node, board, BLACK, policy_probs, board_size)

    total_prior = sum(child.prior for child in node.children.values())
    assert total_prior == pytest.approx(1.0, abs=1e-5)


def test_expand_falls_back_to_uniform_prior_when_policy_mass_is_near_zero() -> None:
    board_size = TEST_BOARD_SIZE
    board = create_initial_board(board_size)
    node = MCTSNode(prior=1.0)
    policy_probs = np.zeros(board_size**3, dtype=np.float32)

    expand(node, board, BLACK, policy_probs, board_size)

    legal_move_count = len(get_valid_moves(board, BLACK, board_size))
    for child in node.children.values():
        assert child.prior == pytest.approx(1.0 / legal_move_count)


def test_expand_does_nothing_when_no_legal_moves_exist() -> None:
    board_size = TEST_BOARD_SIZE
    board = [BLACK] * (board_size**3)
    node = MCTSNode(prior=1.0)
    policy_probs = np.full(board_size**3, 1.0 / board_size**3, dtype=np.float32)

    expand(node, board, WHITE, policy_probs, board_size)

    assert node.children == {}


# --- add_dirichlet_noise ---


def test_add_dirichlet_noise_keeps_priors_summing_to_one() -> None:
    root = MCTSNode(prior=1.0)
    root.children = {
        (0, 0, 0): MCTSNode(prior=0.5),
        (1, 0, 0): MCTSNode(prior=0.5),
    }
    rng = np.random.default_rng(42)

    add_dirichlet_noise(root, alpha=0.3, epsilon=0.25, rng=rng)

    total_prior = sum(child.prior for child in root.children.values())
    assert total_prior == pytest.approx(1.0, abs=1e-6)


def test_add_dirichlet_noise_with_full_epsilon_replaces_priors_with_noise() -> None:
    root = MCTSNode(prior=1.0)
    root.children = {
        (0, 0, 0): MCTSNode(prior=1.0),
        (1, 0, 0): MCTSNode(prior=0.0),
    }
    rng = np.random.default_rng(1)

    add_dirichlet_noise(root, alpha=0.3, epsilon=1.0, rng=rng)

    priors = [child.prior for child in root.children.values()]
    assert priors != [1.0, 0.0]
    assert sum(priors) == pytest.approx(1.0, abs=1e-6)


def test_add_dirichlet_noise_does_nothing_when_no_children() -> None:
    root = MCTSNode(prior=1.0)

    add_dirichlet_noise(root, alpha=0.3, epsilon=0.25, rng=np.random.default_rng(0))

    assert root.children == {}


# --- select_child_by_puct ---


def test_select_child_by_puct_prefers_higher_prior_when_unvisited() -> None:
    node = MCTSNode(prior=1.0, visit_count=1)
    node.children = {
        (0, 0, 0): MCTSNode(prior=0.9),
        (1, 0, 0): MCTSNode(prior=0.1),
    }

    move, _child = select_child_by_puct(node, puct_c=1.5)

    assert move == (0, 0, 0)


def test_select_child_by_puct_prefers_higher_mean_value_child() -> None:
    node = MCTSNode(prior=1.0, visit_count=10)
    strong_child = MCTSNode(prior=0.5, visit_count=5, value_sum=-5.0)  # mean_value=-1.0 -> Q=+1.0
    weak_child = MCTSNode(prior=0.5, visit_count=5, value_sum=5.0)  # mean_value=+1.0 -> Q=-1.0
    node.children = {(0, 0, 0): weak_child, (1, 0, 0): strong_child}

    move, child = select_child_by_puct(node, puct_c=0.0)

    assert move == (1, 0, 0)
    assert child is strong_child


# --- normalized_visit_counts ---


def test_normalized_visit_counts_sums_to_one() -> None:
    root = MCTSNode(prior=1.0)
    root.children = {
        (0, 0, 0): MCTSNode(prior=0.5, visit_count=3),
        (1, 0, 0): MCTSNode(prior=0.5, visit_count=1),
    }

    distribution = normalized_visit_counts(root)

    assert distribution[(0, 0, 0)] == pytest.approx(0.75)
    assert distribution[(1, 0, 0)] == pytest.approx(0.25)
    assert sum(distribution.values()) == pytest.approx(1.0)


def test_normalized_visit_counts_is_all_zero_when_no_visits_recorded() -> None:
    root = MCTSNode(prior=1.0)
    root.children = {(0, 0, 0): MCTSNode(prior=1.0)}

    distribution = normalized_visit_counts(root)

    assert distribution == {(0, 0, 0): 0.0}


# --- predict (CUDA) ---


def test_predict_returns_full_length_softmax_policy_and_scalar_value(
    cuda_device: torch.device,
) -> None:
    board_size = TEST_BOARD_SIZE
    network = make_small_network(board_size).to(cuda_device)
    board = create_initial_board(board_size)

    policy_probs, value = predict(network, board, BLACK, board_size, cuda_device)

    assert policy_probs.shape == (board_size**3,)
    assert policy_probs.sum() == pytest.approx(1.0, abs=1e-4)
    assert -1.0 <= value <= 1.0


# --- mcts_search integration (CUDA) ---


def test_mcts_search_only_assigns_visits_to_legal_moves(cuda_device: torch.device) -> None:
    board_size = TEST_BOARD_SIZE
    network = make_small_network(board_size).to(cuda_device)
    board = create_initial_board(board_size)
    rng = np.random.default_rng(7)

    distribution = mcts_search(
        board, BLACK, network, board_size, TEST_NUM_SIMULATIONS, cuda_device, rng=rng
    )

    legal_moves = set(get_valid_moves(board, BLACK, board_size))
    assert set(distribution.keys()) == legal_moves
    assert sum(distribution.values()) == pytest.approx(1.0, abs=1e-6)
    assert all(probability >= 0.0 for probability in distribution.values())


def test_mcts_search_is_deterministic_given_the_same_rng_seed(cuda_device: torch.device) -> None:
    board_size = TEST_BOARD_SIZE
    network = make_small_network(board_size).to(cuda_device)
    torch.manual_seed(0)
    board = create_initial_board(board_size)

    distribution_a = mcts_search(
        board,
        BLACK,
        network,
        board_size,
        TEST_NUM_SIMULATIONS,
        cuda_device,
        rng=np.random.default_rng(123),
    )
    distribution_b = mcts_search(
        board,
        BLACK,
        network,
        board_size,
        TEST_NUM_SIMULATIONS,
        cuda_device,
        rng=np.random.default_rng(123),
    )

    assert distribution_a == distribution_b


def test_evaluate_leaf_handles_forced_pass_without_expanding_the_leaf(
    cuda_device: torch.device,
) -> None:
    # 4x4x4盤で、以下の11手を打った局面でWHITEが(0,2,0)に着手すると、直後にBLACKが
    # 着手不能（パス）になることを事前に(training/game_rules.pyのみを使って)確認済みの
    # 決定論的な局面を使う。MCTS探索のランダムな手選びに頼らず、パス分岐を直接検証する。
    board_size = TEST_BOARD_SIZE
    moves = [
        ((1, 0, 2), BLACK),
        ((0, 3, 3), WHITE),
        ((2, 0, 1), BLACK),
        ((0, 0, 2), WHITE),
        ((0, 1, 2), BLACK),
        ((1, 0, 1), WHITE),
        ((0, 2, 1), BLACK),
        ((0, 0, 0), WHITE),
        ((2, 2, 3), BLACK),
        ((0, 2, 2), WHITE),
        ((1, 0, 0), BLACK),
        ((0, 2, 0), WHITE),
    ]
    board = create_initial_board(board_size)
    for (x, y, z), color in moves:
        board = apply_move(board, x, y, z, color, board_size)

    assert index_of(0, 2, 0, board_size) >= 0  # sanity: fixture uses valid coordinates
    assert get_valid_moves(board, BLACK, board_size) == []

    network = make_small_network(board_size).to(cuda_device)
    node = MCTSNode(prior=1.0)
    rng = np.random.default_rng(3)

    value = _evaluate_leaf(
        node,
        board,
        BLACK,
        network,
        board_size,
        num_simulations=4,
        device=cuda_device,
        puct_c=1.5,
        rng=rng,
    )

    assert node.is_expanded is False
    assert -1.0 <= value <= 1.0
