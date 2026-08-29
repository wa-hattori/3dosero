"""方策/価値ネットワーク（Stem→残差ブロック×N→方策ヘッド/価値ヘッド）の定義。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「ネットワーク構成」節。
盤面サイズごとに重みを共有しない独立モデルとして扱うため、`board_size` を
コンストラクタ引数に取る。
"""

from __future__ import annotations

import torch
import torch.nn.functional as functional
from torch import nn

INPUT_CHANNELS = 2
POLICY_HEAD_CHANNELS = 2
VALUE_HEAD_CHANNELS = 1
VALUE_HIDDEN_UNITS = 64


class ResidualBlock3D(nn.Module):
    """`[Conv3d→BN→ReLU→Conv3d→BN] + skip → ReLU` の3D残差ブロック。"""

    def __init__(self, channels: int) -> None:
        """残差ブロックを構築する。

        Args:
            channels: 入出力チャンネル数（ブロック内で不変）。
        """
        super().__init__()
        self.conv1 = nn.Conv3d(channels, channels, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm3d(channels)
        self.conv2 = nn.Conv3d(channels, channels, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm3d(channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """残差ブロックを適用する。

        Args:
            x: shape `(batch, channels, D, H, W)` の入力テンソル。

        Returns:
            xと同じshapeの出力テンソル。
        """
        residual = x
        out = functional.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        return functional.relu(out + residual)


class PolicyValueNetwork(nn.Module):
    """立体盤面用の方策/価値ネットワーク。

    Stem → 残差ブロック × `num_residual_blocks` → 方策ヘッド / 価値ヘッドの構成。
    """

    def __init__(
        self,
        board_size: int,
        num_residual_blocks: int = 6,
        base_channels: int = 64,
    ) -> None:
        """ネットワークを構築する。

        Args:
            board_size: 盤面の1辺のマス数。
            num_residual_blocks: 残差ブロックの数（SKILL.mdの目安値は6）。
            base_channels: Stem/残差ブロックのチャンネル数（SKILL.mdの目安値は64）。
        """
        super().__init__()
        self.board_size = board_size
        num_cells = board_size**3

        self.stem_conv = nn.Conv3d(INPUT_CHANNELS, base_channels, kernel_size=3, padding=1)
        self.stem_bn = nn.BatchNorm3d(base_channels)

        self.residual_blocks = nn.ModuleList(
            ResidualBlock3D(base_channels) for _ in range(num_residual_blocks)
        )

        self.policy_conv = nn.Conv3d(base_channels, POLICY_HEAD_CHANNELS, kernel_size=1)
        self.policy_bn = nn.BatchNorm3d(POLICY_HEAD_CHANNELS)
        self.policy_fc = nn.Linear(POLICY_HEAD_CHANNELS * num_cells, num_cells)

        self.value_conv = nn.Conv3d(base_channels, VALUE_HEAD_CHANNELS, kernel_size=1)
        self.value_bn = nn.BatchNorm3d(VALUE_HEAD_CHANNELS)
        self.value_fc1 = nn.Linear(VALUE_HEAD_CHANNELS * num_cells, VALUE_HIDDEN_UNITS)
        self.value_fc2 = nn.Linear(VALUE_HIDDEN_UNITS, 1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """盤面テンソルから方策logitsと価値を計算する。

        方策の合法手マスク付きsoftmaxはこのモジュールの責務ではない
        （盤面テンソル単独からは合法手を判定できないため）。呼び出し側が
        `get_valid_moves` 等で得た合法手マスクを使って `mask_policy_logits` を
        適用する。

        Args:
            x: shape `(batch, 2, board_size, board_size, board_size)` の入力テンソル。
                `board_encoding.encode_board` と同じ `(channel, z, y, x)` 規約。

        Returns:
            `(policy_logits, value)` のタプル。
            `policy_logits` は shape `(batch, board_size ** 3)` の生logits
            （未softmax・未マスク、`indexOf(x, y, z, board_size)` 順）。
            `value` は shape `(batch, 1)`、`to_move` 視点の期待勝敗で `[-1, 1]` に収まる。
        """
        out = functional.relu(self.stem_bn(self.stem_conv(x)))
        for block in self.residual_blocks:
            out = block(out)

        policy = functional.relu(self.policy_bn(self.policy_conv(out)))
        policy = policy.flatten(start_dim=1)
        policy_logits = self.policy_fc(policy)

        value = functional.relu(self.value_bn(self.value_conv(out)))
        value = value.flatten(start_dim=1)
        value = functional.relu(self.value_fc1(value))
        value = torch.tanh(self.value_fc2(value))

        return policy_logits, value


def mask_policy_logits(
    policy_logits: torch.Tensor, legal_moves_mask: torch.Tensor
) -> torch.Tensor:
    """合法手以外を`-inf`でマスクしてからsoftmaxした方策確率を返す。

    SKILL.mdの方策ヘッド仕様（「合法手以外を`-inf`でマスクしてから`softmax`」）を
    実装する純粋関数。盤面テンソル単独では合法手を判定できないため、
    `PolicyValueNetwork.forward` からは独立させ、合法手マスクが判明している
    呼び出し側（MCTSの展開処理など）で適用する。

    Args:
        policy_logits: shape `(batch, board_size ** 3)` の生logits。
        legal_moves_mask: shape `(batch, board_size ** 3)` の真偽値マスク
            （`True` = 合法手）。`policy_logits` と同じ形状・デバイス。

    Returns:
        合法手にのみ確率質量を持つ、shape `(batch, board_size ** 3)` の確率分布。
    """
    masked_logits = policy_logits.masked_fill(~legal_moves_mask, float("-inf"))
    return functional.softmax(masked_logits, dim=-1)
