"""学習済みチェックポイントをブラウザ推論用のONNX形式にエクスポートする。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「ブラウザ推論仕様」節。
入力 shape `(1, 2, board_size, board_size, board_size)`、出力は
`policy_logits`（shape `(1, board_size**3)`、`index_of`順・未softmax・未マスク）と
`value`（shape `(1, 1)`）の2つ。`board_size` ごとに固定形状のモデルとして書き出す
（`dynamic_axes`は使わない。盤面サイズごとに別々のONNXファイルを持つ設計のため）。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch

from training.checkpoint_eval import load_network_from_checkpoint
from training.config import BASE_CHANNELS, RESIDUAL_BLOCKS

INPUT_NAME = "board"
POLICY_OUTPUT_NAME = "policy_logits"
VALUE_OUTPUT_NAME = "value"
DEFAULT_OPSET_VERSION = 17


def export_checkpoint_to_onnx(
    checkpoint_path: Path,
    onnx_path: Path,
    board_size: int,
    device: torch.device,
    num_residual_blocks: int = RESIDUAL_BLOCKS,
    base_channels: int = BASE_CHANNELS,
    opset_version: int = DEFAULT_OPSET_VERSION,
) -> Path:
    """チェックポイントをロードし、固定形状のONNXモデルとして書き出す。

    Args:
        checkpoint_path: `train.save_checkpoint` が書き出したチェックポイントのパス。
        onnx_path: 書き出し先のONNXファイルパス（親ディレクトリが無ければ作成する）。
        board_size: 盤面の1辺のマス数（チェックポイント保存時と一致させること）。
        device: エクスポート時にネットワークを配置・実行するデバイス。
        num_residual_blocks: 残差ブロック数（チェックポイント保存時と一致させること）。
        base_channels: Stem/残差ブロックのチャンネル数（チェックポイント保存時と一致させること）。
        opset_version: ONNX opsetバージョン。

    Returns:
        書き出したファイルのパス（`onnx_path`と同じ）。
    """
    network = load_network_from_checkpoint(
        checkpoint_path, board_size, device, num_residual_blocks, base_channels
    )
    dummy_input = torch.zeros(1, 2, board_size, board_size, board_size, device=device)
    onnx_path.parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        network,
        (dummy_input,),
        str(onnx_path),
        input_names=[INPUT_NAME],
        output_names=[POLICY_OUTPUT_NAME, VALUE_OUTPUT_NAME],
        opset_version=opset_version,
        # PyTorch 2.9時点ではdynamo=Trueが新しいtorch.exportベースの実装だが、まだ
        # デフォルトではなく将来デフォルト化予定(現状は警告のみ)。動作実績のある
        # 従来のTorchScriptベースexporterを明示的に固定する
        # (このモジュールのテストで出力の数値一致をONNX Runtimeと突き合わせ済み)。
        dynamo=False,
    )
    return onnx_path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export a training checkpoint to ONNX for browser inference."
    )
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--onnx-output", type=Path, required=True)
    parser.add_argument("--board-size", type=int, required=True)
    return parser.parse_args()


def main() -> None:
    """CLIエントリポイント。

    `python -m training.export_onnx --checkpoint training/checkpoints/8/game_000150.pt \\
        --onnx-output data/models/8/level5.onnx --board-size 8`
    """
    args = _parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    output_path = export_checkpoint_to_onnx(
        args.checkpoint, args.onnx_output, args.board_size, device
    )
    print(f"exported: {output_path}")


if __name__ == "__main__":
    main()
