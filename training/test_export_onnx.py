"""export_onnx.py のユニットテスト。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「ブラウザ推論仕様」節。
書き出したONNXモデルの出力が、エクスポート元のPyTorchモデルの出力と一致することを
`onnxruntime`（CPU版、検証専用の開発依存）で確認する。
"""

from pathlib import Path

import numpy as np
import onnxruntime
import pytest
import torch

from training.export_onnx import (
    INPUT_NAME,
    POLICY_OUTPUT_NAME,
    VALUE_OUTPUT_NAME,
    export_checkpoint_to_onnx,
)
from training.network import PolicyValueNetwork
from training.train import save_checkpoint

CUDA_REQUIRED_REASON = "CUDA is required to validate GPU-backed export per project policy"

# テスト側のローカル定数。本番用の目安値(training/config.py)より大幅に小さくする。
TEST_BOARD_SIZE = 4
TEST_NUM_RESIDUAL_BLOCKS = 1
TEST_BASE_CHANNELS = 8


@pytest.fixture
def cuda_device() -> torch.device:
    if not torch.cuda.is_available():
        pytest.skip(CUDA_REQUIRED_REASON)
    return torch.device("cuda")


def _make_checkpoint(tmp_path: Path) -> Path:
    network = PolicyValueNetwork(
        board_size=TEST_BOARD_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )
    return save_checkpoint(network, tmp_path, board_size=TEST_BOARD_SIZE, games_played=1)


def test_export_checkpoint_to_onnx_writes_a_file(cuda_device: torch.device, tmp_path: Path) -> None:
    checkpoint = _make_checkpoint(tmp_path / "checkpoints")
    onnx_path = tmp_path / "model.onnx"

    result = export_checkpoint_to_onnx(
        checkpoint,
        onnx_path,
        TEST_BOARD_SIZE,
        cuda_device,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )

    assert result == onnx_path
    assert onnx_path.is_file()


def test_export_checkpoint_to_onnx_output_matches_pytorch_forward_pass(
    cuda_device: torch.device, tmp_path: Path
) -> None:
    checkpoint = _make_checkpoint(tmp_path / "checkpoints")
    onnx_path = tmp_path / "model.onnx"
    export_checkpoint_to_onnx(
        checkpoint,
        onnx_path,
        TEST_BOARD_SIZE,
        cuda_device,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )

    network = PolicyValueNetwork(
        board_size=TEST_BOARD_SIZE,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )
    network.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True))
    network.eval()

    rng = np.random.default_rng(0)
    sample_input = rng.standard_normal(
        (1, 2, TEST_BOARD_SIZE, TEST_BOARD_SIZE, TEST_BOARD_SIZE)
    ).astype(np.float32)

    with torch.no_grad():
        torch_policy, torch_value = network(torch.from_numpy(sample_input))

    session = onnxruntime.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    onnx_policy, onnx_value = session.run(
        [POLICY_OUTPUT_NAME, VALUE_OUTPUT_NAME], {INPUT_NAME: sample_input}
    )

    np.testing.assert_allclose(onnx_policy, torch_policy.numpy(), rtol=1e-3, atol=1e-4)
    np.testing.assert_allclose(onnx_value, torch_value.numpy(), rtol=1e-3, atol=1e-4)


def test_export_checkpoint_to_onnx_output_shapes_match_skill_spec(
    cuda_device: torch.device, tmp_path: Path
) -> None:
    checkpoint = _make_checkpoint(tmp_path / "checkpoints")
    onnx_path = tmp_path / "model.onnx"
    export_checkpoint_to_onnx(
        checkpoint,
        onnx_path,
        TEST_BOARD_SIZE,
        cuda_device,
        num_residual_blocks=TEST_NUM_RESIDUAL_BLOCKS,
        base_channels=TEST_BASE_CHANNELS,
    )

    session = onnxruntime.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    sample_input = np.zeros(
        (1, 2, TEST_BOARD_SIZE, TEST_BOARD_SIZE, TEST_BOARD_SIZE), dtype=np.float32
    )

    policy, value = session.run([POLICY_OUTPUT_NAME, VALUE_OUTPUT_NAME], {INPUT_NAME: sample_input})

    assert policy.shape == (1, TEST_BOARD_SIZE**3)
    assert value.shape == (1, 1)
