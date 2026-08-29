"""盤面の値・座標変換に関する共有定数・純粋関数。

正本: `src/logic/board.js`。`EMPTY`/`BLACK`/`WHITE` の値、`index_of` の
フラット化順序（`x + y*board_size + z*board_size**2`）はJS側と一致させる。

`board_encoding.py`（`torch`/`numpy` に依存）と `game_rules.py`（依存なし）の
両方がこのモジュールから同じ定義を再輸出することで、値・変換式を二重管理しない。
"""

from __future__ import annotations

EMPTY = 0
BLACK = 1
WHITE = 2


def opposite_color(color: int) -> int:
    """指定した石の色の相手の色を返す。

    Args:
        color: `BLACK` または `WHITE`。

    Returns:
        相手の色(`BLACK` なら `WHITE`、`WHITE` なら `BLACK`)。
    """
    return WHITE if color == BLACK else BLACK


def index_of(x: int, y: int, z: int, board_size: int) -> int:
    """3D座標を盤面配列上のフラットなインデックスに変換する。

    `src/logic/board.js` の `indexOf(x, y, z, boardSize)` と同じ規約
    (`x + y*boardSize + z*boardSize**2`)。

    Args:
        x: x座標(0〜board_size-1)。
        y: y座標(0〜board_size-1)。
        z: z座標(0〜board_size-1、層)。
        board_size: 盤面の1辺のマス数。

    Returns:
        フラット化された盤面配列上のインデックス。
    """
    return x + y * board_size + z * board_size**2
