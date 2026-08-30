"""train.py のユニットテスト。

正本: .claude/skills/gan-cpu-self-play/SKILL.md の「学習ステップ」節・
「チェックポイント方針」節。
`train_step` はネットワークのforward/backwardを伴うためCUDAデバイス上で実行して
検証する（本プロジェクトのGPUテスト方針）。チェックポイント保存先は必ず `tmp_path`
（pytest標準の一時ディレクトリ）を使い、実際の `training/checkpoints/` は汚さない。
"""

import math
from pathlib import Path

import pytest
import torch

from training.network import PolicyValueNetwork
from training.train import (
    checkpoint_path,
    parse_checkpoint_path,
    save_checkpoint,
    should_save_checkpoint,
    train_step,
)

CUDA_REQUIRED_REASON = "CUDA is required to validate GPU-backed training per project policy"

# テスト側のローカル定数。本番用の目安値(training/config.py)より大幅に小さくする。
TEST_BOARD_SIZE = 4
TEST_BATCH_SIZE = 4
TEST_NUM_RESIDUAL_BLOCKS = 1
TEST_BASE_CHANNELS = 8


@pytest.fixture
def cuda_device() -> torch.device:
    if not torch.cuda.is_available():
        pytest.skip(CUDA_REQUIRED_REASON)
    return torch.device("cuda")


def make_dummy_batch(
    board_size: int, batch_size: int, device: torch.device
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    generator = torch.Generator(device="cpu").manual_seed(0)
    boards = torch.randint(
        0, 2, (batch_size, 2, board_size, board_size, board_size), generator=generator
    ).to(device=device, dtype=torch.float32)

    num_cells = board_size**3
    target_indices = torch.randint(0, num_cells, (batch_size,), generator=generator)
    target_policies = torch.zeros(batch_size, num_cells)
    target_policies[torch.arange(batch_size), target_indices] = 1.0
    target_policies = target_policies.to(device)

    target_values = (torch.rand(batch_size, 1, generator=generator) * 2 - 1).to(device)

    return boards, target_policies, target_values


# --- train_step (CUDA) ---


def test_train_step_returns_a_finite_non_negative_loss(cuda_device: torch.device) -> None:
    network = PolicyValueNetwork(
        board_size=TEST_BOARD_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    ).to(cuda_device)
    optimizer = torch.optim.Adam(network.parameters(), lr=1e-3)
    batch = make_dummy_batch(TEST_BOARD_SIZE, TEST_BATCH_SIZE, cuda_device)

    loss = train_step(network, optimizer, batch)

    assert math.isfinite(loss)
    assert loss >= 0.0


def test_train_step_does_not_produce_nan_loss_across_several_steps(
    cuda_device: torch.device,
) -> None:
    network = PolicyValueNetwork(
        board_size=TEST_BOARD_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    ).to(cuda_device)
    optimizer = torch.optim.Adam(network.parameters(), lr=1e-3)

    for step in range(5):
        batch = make_dummy_batch(TEST_BOARD_SIZE, TEST_BATCH_SIZE, cuda_device)
        loss = train_step(network, optimizer, batch)
        assert math.isfinite(loss), f"loss became non-finite at step {step}"


def test_train_step_updates_network_parameters(cuda_device: torch.device) -> None:
    network = PolicyValueNetwork(
        board_size=TEST_BOARD_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    ).to(cuda_device)
    optimizer = torch.optim.Adam(network.parameters(), lr=1e-2)
    batch = make_dummy_batch(TEST_BOARD_SIZE, TEST_BATCH_SIZE, cuda_device)
    params_before = [parameter.detach().clone() for parameter in network.parameters()]

    train_step(network, optimizer, batch)

    params_after = list(network.parameters())
    assert any(
        not torch.equal(before, after.detach())
        for before, after in zip(params_before, params_after, strict=True)
    )


# --- checkpoint_path / should_save_checkpoint (pure) ---


def test_checkpoint_path_follows_board_size_and_zero_padded_game_count_convention(
    tmp_path: Path,
) -> None:
    path = checkpoint_path(tmp_path, board_size=8, games_played=200)

    assert path == tmp_path / "8" / "game_000200.pt"


def test_parse_checkpoint_path_round_trips_with_checkpoint_path(tmp_path: Path) -> None:
    path = checkpoint_path(tmp_path, board_size=8, games_played=150)

    assert parse_checkpoint_path(path) == (8, 150)


def test_parse_checkpoint_path_rejects_a_path_with_the_wrong_naming_convention(
    tmp_path: Path,
) -> None:
    bad_path = tmp_path / "8" / "not-a-checkpoint.pt"

    with pytest.raises(ValueError, match="naming convention"):
        parse_checkpoint_path(bad_path)


def test_should_save_checkpoint_true_at_exact_multiples_of_interval() -> None:
    assert should_save_checkpoint(200, checkpoint_interval_games=200) is True
    assert should_save_checkpoint(400, checkpoint_interval_games=200) is True


def test_should_save_checkpoint_false_between_intervals() -> None:
    assert should_save_checkpoint(199, checkpoint_interval_games=200) is False
    assert should_save_checkpoint(201, checkpoint_interval_games=200) is False


def test_should_save_checkpoint_false_at_zero_games_played() -> None:
    assert should_save_checkpoint(0, checkpoint_interval_games=200) is False


# --- save_checkpoint ---


def test_save_checkpoint_writes_a_file_at_the_expected_path(tmp_path: Path) -> None:
    network = PolicyValueNetwork(
        board_size=TEST_BOARD_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )

    saved_path = save_checkpoint(network, tmp_path, board_size=TEST_BOARD_SIZE, games_played=200)

    assert saved_path == tmp_path / str(TEST_BOARD_SIZE) / "game_000200.pt"
    assert saved_path.is_file()


def test_save_checkpoint_does_not_write_outside_tmp_path(tmp_path: Path) -> None:
    network = PolicyValueNetwork(
        board_size=TEST_BOARD_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )

    save_checkpoint(network, tmp_path, board_size=TEST_BOARD_SIZE, games_played=200)

    real_checkpoints_dir = Path(__file__).resolve().parent / "checkpoints"
    assert not real_checkpoints_dir.exists()


def test_save_checkpoint_round_trips_network_weights(tmp_path: Path) -> None:
    network = PolicyValueNetwork(
        board_size=TEST_BOARD_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )

    saved_path = save_checkpoint(network, tmp_path, board_size=TEST_BOARD_SIZE, games_played=200)

    reloaded_network = PolicyValueNetwork(
        board_size=TEST_BOARD_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )
    reloaded_network.load_state_dict(torch.load(saved_path, weights_only=True))

    for original, reloaded in zip(
        network.state_dict().values(), reloaded_network.state_dict().values(), strict=True
    ):
        assert torch.equal(original, reloaded)
