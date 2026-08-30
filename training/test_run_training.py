"""run_training.py のスモークテスト。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md`。学習ループ本体は
([testing.md](../.claude/rules/common/testing.md) の方針により)「小規模データでの
動作確認」の対象であり、「良いモデルが得られるか」は検証しない。ここでは
極小盤面・少シミュレーション回数・少ゲーム数で、クラッシュせず・チェックポイントが
実際に保存されることだけを確認する。CUDA上で実行する。
"""

from pathlib import Path

import numpy as np
import pytest
import torch

from training.run_training import ReplayBuffer, examples_to_batch, run_training

CUDA_REQUIRED_REASON = "CUDA is required to validate GPU-backed training per project policy"

# スモークテスト用のローカル定数。本番用の目安値(training/config.py)より大幅に小さくする。
TEST_BOARD_SIZE = 4
TEST_NUM_SIMULATIONS = 4
TEST_NUM_RESIDUAL_BLOCKS = 1
TEST_BASE_CHANNELS = 8
TEST_BATCH_SIZE = 4


@pytest.fixture
def cuda_device() -> torch.device:
    if not torch.cuda.is_available():
        pytest.skip(CUDA_REQUIRED_REASON)
    return torch.device("cuda")


# --- ReplayBuffer ---


def test_replay_buffer_add_game_appends_examples() -> None:
    buffer = ReplayBuffer(capacity=10)

    buffer.add_game([(1, 2, 3)])
    buffer.add_game([(4, 5, 6)])

    assert len(buffer) == 2


def test_replay_buffer_evicts_oldest_examples_beyond_capacity() -> None:
    buffer = ReplayBuffer(capacity=2)

    buffer.add_game([("a", 0, 0)])
    buffer.add_game([("b", 0, 0)])
    buffer.add_game([("c", 0, 0)])

    assert len(buffer) == 2
    assert [example[0] for example in buffer.examples] == ["b", "c"]


def test_replay_buffer_sample_batch_returns_requested_size_when_enough_examples() -> None:
    buffer = ReplayBuffer(capacity=10)
    for i in range(5):
        buffer.add_game([(i, 0, 0)])
    rng = np.random.default_rng(0)

    batch = buffer.sample_batch(3, rng)

    assert len(batch) == 3


def test_replay_buffer_sample_batch_caps_at_buffer_size() -> None:
    buffer = ReplayBuffer(capacity=10)
    buffer.add_game([(0, 0, 0), (1, 0, 0)])
    rng = np.random.default_rng(0)

    batch = buffer.sample_batch(10, rng)

    assert len(batch) == 2


# --- examples_to_batch ---


def test_examples_to_batch_produces_expected_shapes(cuda_device: torch.device) -> None:
    board_size = TEST_BOARD_SIZE
    num_cells = board_size**3
    examples = [
        (torch.zeros(2, board_size, board_size, board_size), np.zeros(num_cells), 1.0),
        (torch.ones(2, board_size, board_size, board_size), np.ones(num_cells), -1.0),
    ]

    boards, policies, values = examples_to_batch(examples, cuda_device)

    assert boards.shape == (2, 2, board_size, board_size, board_size)
    assert policies.shape == (2, num_cells)
    assert values.shape == (2, 1)
    assert boards.device.type == "cuda"


# --- run_training (CUDA smoke test) ---


def test_run_training_smoke_runs_and_saves_a_checkpoint(
    cuda_device: torch.device, tmp_path: Path
) -> None:
    log_lines: list[str] = []

    checkpoint_path = run_training(
        board_size=TEST_BOARD_SIZE,
        total_games=2,
        num_simulations=TEST_NUM_SIMULATIONS,
        device=cuda_device,
        checkpoint_root=tmp_path,
        checkpoint_interval_games=1,
        batch_size=TEST_BATCH_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
        train_steps_per_game=1,
        rng=np.random.default_rng(0),
        log_fn=log_lines.append,
    )

    assert checkpoint_path.is_file()
    assert checkpoint_path == tmp_path / str(TEST_BOARD_SIZE) / "game_000002.pt"
    progress_lines = [line for line in log_lines if line.startswith("game=")]
    checkpoint_lines = [line for line in log_lines if line.startswith("saved checkpoint")]
    assert len(progress_lines) == 2
    assert "game=1/2" in progress_lines[0]
    assert "game=2/2" in progress_lines[1]
    # checkpoint_interval_games=1 なので毎局チェックポイントが保存される。
    assert len(checkpoint_lines) == 2


def test_run_training_resumes_from_a_previous_checkpoint_and_continues_game_numbering(
    cuda_device: torch.device, tmp_path: Path
) -> None:
    first_checkpoint = run_training(
        board_size=TEST_BOARD_SIZE,
        total_games=2,
        num_simulations=TEST_NUM_SIMULATIONS,
        device=cuda_device,
        checkpoint_root=tmp_path,
        checkpoint_interval_games=2,
        batch_size=TEST_BATCH_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
        train_steps_per_game=1,
        rng=np.random.default_rng(0),
    )
    assert first_checkpoint == tmp_path / str(TEST_BOARD_SIZE) / "game_000002.pt"

    log_lines: list[str] = []
    second_checkpoint = run_training(
        board_size=TEST_BOARD_SIZE,
        total_games=2,
        num_simulations=TEST_NUM_SIMULATIONS,
        device=cuda_device,
        checkpoint_root=tmp_path,
        checkpoint_interval_games=2,
        batch_size=TEST_BATCH_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
        train_steps_per_game=1,
        resume_from=first_checkpoint,
        rng=np.random.default_rng(1),
        log_fn=log_lines.append,
    )

    # 再開後はゲーム数の通し番号が引き継がれ、game_000002.ptの続きから
    # game_000004.ptに保存される(1から数え直さない)。
    assert second_checkpoint == tmp_path / str(TEST_BOARD_SIZE) / "game_000004.pt"
    assert any("resumed from" in line and str(first_checkpoint) in line for line in log_lines)
    assert any("game=3/4" in line for line in log_lines)
    assert any("game=4/4" in line for line in log_lines)


def test_run_training_resume_rejects_a_board_size_mismatch(
    cuda_device: torch.device, tmp_path: Path
) -> None:
    checkpoint = run_training(
        board_size=TEST_BOARD_SIZE,
        total_games=1,
        num_simulations=TEST_NUM_SIMULATIONS,
        device=cuda_device,
        checkpoint_root=tmp_path,
        checkpoint_interval_games=1,
        batch_size=TEST_BATCH_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
        train_steps_per_game=1,
        rng=np.random.default_rng(0),
    )

    with pytest.raises(ValueError, match="board_size"):
        run_training(
            board_size=6,
            total_games=1,
            num_simulations=TEST_NUM_SIMULATIONS,
            device=cuda_device,
            checkpoint_root=tmp_path,
            num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
            base_channels=TEST_BASE_CHANNELS,
            resume_from=checkpoint,
            rng=np.random.default_rng(0),
        )


def test_run_training_saves_final_checkpoint_when_not_on_interval_boundary(
    cuda_device: torch.device, tmp_path: Path
) -> None:
    checkpoint_path = run_training(
        board_size=TEST_BOARD_SIZE,
        total_games=3,
        num_simulations=TEST_NUM_SIMULATIONS,
        device=cuda_device,
        checkpoint_root=tmp_path,
        checkpoint_interval_games=100,  # 3局では一度もインターバルに到達しない
        batch_size=TEST_BATCH_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
        train_steps_per_game=1,
        rng=__import__("numpy").random.default_rng(1),
    )

    assert checkpoint_path.is_file()
    assert checkpoint_path == tmp_path / str(TEST_BOARD_SIZE) / "game_000003.pt"
