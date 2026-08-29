"""finalize_levels.py の統合スモークテスト。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md`。`evaluate_checkpoints`(Elo評価、
MCTS込みの対局)を実際に伴うためCUDA上で実行する。小盤面・少チェックポイント・
少シミュレーション回数・少対局数の「配線が正しく動くか」のスモークテストであり、
「選ばれたレベルが実際に強さ順になっているか」は検証しない
(evaluate_checkpoints/select_levels側で個別に検証済み)。
"""

from pathlib import Path

import numpy as np
import onnxruntime
import pytest
import torch

from training.finalize_levels import finalize_levels
from training.network import PolicyValueNetwork
from training.train import save_checkpoint

CUDA_REQUIRED_REASON = "CUDA is required to validate GPU-backed evaluation per project policy"

# スモークテスト用のローカル定数。本番用の目安値(training/config.py)より大幅に小さくする。
TEST_BOARD_SIZE = 4
TEST_NUM_RESIDUAL_BLOCKS = 1
TEST_BASE_CHANNELS = 8
TEST_NUM_SIMULATIONS = 4
TEST_GAMES_PER_MATCHUP = 1
TEST_NUM_CHECKPOINTS = 5


@pytest.fixture
def cuda_device() -> torch.device:
    if not torch.cuda.is_available():
        pytest.skip(CUDA_REQUIRED_REASON)
    return torch.device("cuda")


def _make_checkpoints(tmp_path: Path, count: int) -> list[Path]:
    checkpoint_dir = tmp_path / "checkpoints"
    paths = []
    for i in range(count):
        torch.manual_seed(i)
        network = PolicyValueNetwork(
            board_size=TEST_BOARD_SIZE,
            num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
            base_channels=TEST_BASE_CHANNELS,
        )
        paths.append(
            save_checkpoint(network, checkpoint_dir, board_size=TEST_BOARD_SIZE, games_played=i + 1)
        )
    return paths


def test_finalize_levels_exports_onnx_for_each_selected_level(
    cuda_device: torch.device, tmp_path: Path
) -> None:
    checkpoint_paths = _make_checkpoints(tmp_path, TEST_NUM_CHECKPOINTS)
    onnx_root = tmp_path / "models"

    exported = finalize_levels(
        checkpoint_paths,
        TEST_BOARD_SIZE,
        cuda_device,
        onnx_root=onnx_root,
        num_simulations=TEST_NUM_SIMULATIONS,
        games_per_matchup=TEST_GAMES_PER_MATCHUP,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
        rng=np.random.default_rng(0),
    )

    assert set(exported.keys()) == {2, 3, 4, 5}
    for level, onnx_path in exported.items():
        assert onnx_path == onnx_root / str(TEST_BOARD_SIZE) / f"level{level}.onnx"
        assert onnx_path.is_file()

        session = onnxruntime.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        sample_input = np.zeros(
            (1, 2, TEST_BOARD_SIZE, TEST_BOARD_SIZE, TEST_BOARD_SIZE), dtype=np.float32
        )
        policy, value = session.run(["policy_logits", "value"], {"board": sample_input})
        assert policy.shape == (1, TEST_BOARD_SIZE**3)
        assert value.shape == (1, 1)


def test_finalize_levels_exports_distinct_checkpoints_per_level(
    cuda_device: torch.device, tmp_path: Path
) -> None:
    checkpoint_paths = _make_checkpoints(tmp_path, TEST_NUM_CHECKPOINTS)
    onnx_root = tmp_path / "models"

    exported = finalize_levels(
        checkpoint_paths,
        TEST_BOARD_SIZE,
        cuda_device,
        onnx_root=onnx_root,
        num_simulations=TEST_NUM_SIMULATIONS,
        games_per_matchup=TEST_GAMES_PER_MATCHUP,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
        rng=np.random.default_rng(1),
    )

    file_sizes = {path.stat().st_size for path in exported.values()}
    file_bytes = [path.read_bytes() for path in exported.values()]
    # 5個の異なる初期化から4個選ぶので、少なくとも中身が全部同一にはならないはず。
    assert len(file_sizes) >= 1  # 形状は同じなのでサイズは同じになりうる、内容で判定する
    assert len({bytes(content) for content in file_bytes}) == len(file_bytes)
