"""盤面状態をモデル入力用テンソルに変換するエンコーディング関数群。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「盤面エンコーディング」節。
値の規約（`EMPTY`/`BLACK`/`WHITE`）と `indexOf` の並び順は `src/logic/board.js` を踏襲する。
"""

from __future__ import annotations

import numpy as np
import torch

EMPTY = 0
BLACK = 1
WHITE = 2


def opposite_color(color: int) -> int:
    """指定した石の色の相手の色を返す。

    Args:
        color: `BLACK` または `WHITE`。

    Returns:
        相手の色（`BLACK` なら `WHITE`、`WHITE` なら `BLACK`）。
    """
    return WHITE if color == BLACK else BLACK


def index_of(x: int, y: int, z: int, board_size: int) -> int:
    """3D座標を盤面配列上のフラットなインデックスに変換する。

    `src/logic/board.js` の `indexOf(x, y, z, boardSize)` と同じ規約
    （`x + y*boardSize + z*boardSize**2`）。

    Args:
        x: x座標（0〜board_size-1）。
        y: y座標（0〜board_size-1）。
        z: z座標（0〜board_size-1、層）。
        board_size: 盤面の1辺のマス数。

    Returns:
        フラット化された盤面配列上のインデックス。
    """
    return x + y * board_size + z * board_size**2


def encode_board(board: list[int], to_move: int, board_size: int) -> torch.Tensor:
    """盤面状態を「今から着手する側」から見た相対表現のテンソルに変換する。

    色をそのまま渡さず自分/相手の2チャンネルに変換することで、黒番・白番どちらでも
    同一ネットワークが使えるようにする。

    Args:
        board: フラット化された盤面状態（長さ `board_size ** 3`、`indexOf` の並び順）。
            各要素は `EMPTY`/`BLACK`/`WHITE` のいずれか。
        to_move: エンコード対象の手番の色（`BLACK` または `WHITE`）。
        board_size: 盤面の1辺のマス数。

    Returns:
        shape `(2, board_size, board_size, board_size)` のfloatテンソル。
        軸は `(channel, z, y, x)`。channel 0 = 自分の石、channel 1 = 相手の石。
    """
    opponent = opposite_color(to_move)
    flat = np.asarray(board, dtype=np.int64).reshape(board_size, board_size, board_size)
    own_plane = (flat == to_move).astype(np.float32)
    opponent_plane = (flat == opponent).astype(np.float32)

    return torch.from_numpy(np.stack([own_plane, opponent_plane]))
