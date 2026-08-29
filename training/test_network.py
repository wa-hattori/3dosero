"""network.py のユニットテスト。

正本: .claude/skills/gan-cpu-self-play/SKILL.md の「ネットワーク構成」節。
forward passはCUDAデバイス上で実行して検証する（本プロジェクトのGPUテスト方針）。
"""

import pytest
import torch

from training.network import PolicyValueNetwork, mask_policy_logits

CUDA_REQUIRED_REASON = "CUDA is required to validate GPU forward pass per project policy"


@pytest.fixture
def cuda_device() -> torch.device:
    if not torch.cuda.is_available():
        pytest.skip(CUDA_REQUIRED_REASON)
    return torch.device("cuda")


def test_forward_returns_policy_shape_of_board_size_cubed(cuda_device: torch.device) -> None:
    board_size = 4
    batch_size = 2
    network = PolicyValueNetwork(
        board_size=board_size, num_residual_blocks=1, base_channels=8
    ).to(cuda_device)
    x = torch.zeros(batch_size, 2, board_size, board_size, board_size, device=cuda_device)

    policy_logits, _value = network(x)

    assert policy_logits.shape == (batch_size, board_size**3)


def test_forward_returns_value_shape_of_one(cuda_device: torch.device) -> None:
    board_size = 4
    batch_size = 3
    network = PolicyValueNetwork(
        board_size=board_size, num_residual_blocks=2, base_channels=8
    ).to(cuda_device)
    x = torch.zeros(batch_size, 2, board_size, board_size, board_size, device=cuda_device)

    _policy_logits, value = network(x)

    assert value.shape == (batch_size, 1)


def test_forward_value_is_bounded_by_tanh_range(cuda_device: torch.device) -> None:
    board_size = 4
    batch_size = 4
    network = PolicyValueNetwork(
        board_size=board_size, num_residual_blocks=1, base_channels=8
    ).to(cuda_device)
    x = torch.randn(batch_size, 2, board_size, board_size, board_size, device=cuda_device)

    _policy_logits, value = network(x)

    assert torch.all(value >= -1.0)
    assert torch.all(value <= 1.0)


def test_forward_runs_on_cuda_device(cuda_device: torch.device) -> None:
    board_size = 4
    network = PolicyValueNetwork(
        board_size=board_size, num_residual_blocks=1, base_channels=8
    ).to(cuda_device)
    x = torch.zeros(1, 2, board_size, board_size, board_size, device=cuda_device)

    policy_logits, value = network(x)

    assert policy_logits.device.type == "cuda"
    assert value.device.type == "cuda"


def test_forward_supports_larger_board_size(cuda_device: torch.device) -> None:
    board_size = 8
    network = PolicyValueNetwork(
        board_size=board_size, num_residual_blocks=1, base_channels=4
    ).to(cuda_device)
    x = torch.zeros(1, 2, board_size, board_size, board_size, device=cuda_device)

    policy_logits, value = network(x)

    assert policy_logits.shape == (1, board_size**3)
    assert value.shape == (1, 1)


def test_mask_policy_logits_zeroes_out_illegal_move_probabilities() -> None:
    policy_logits = torch.tensor([[1.0, 5.0, 2.0, 0.5]])
    legal_moves_mask = torch.tensor([[True, False, True, False]])

    probabilities = mask_policy_logits(policy_logits, legal_moves_mask)

    assert probabilities[0, 1] == 0.0
    assert probabilities[0, 3] == 0.0
    assert probabilities[0, 0] > 0.0
    assert probabilities[0, 2] > 0.0


def test_mask_policy_logits_sums_to_one_over_legal_moves() -> None:
    policy_logits = torch.tensor([[3.0, -1.0, 0.2, 4.0]])
    legal_moves_mask = torch.tensor([[True, True, False, True]])

    probabilities = mask_policy_logits(policy_logits, legal_moves_mask)

    assert torch.isclose(probabilities.sum(), torch.tensor(1.0), atol=1e-6)
