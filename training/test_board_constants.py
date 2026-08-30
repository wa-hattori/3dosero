"""board_constants.py のユニットテスト。

正本: `src/logic/board.js`（`board.test.js` と対応する検証観点）。
"""

from training.board_constants import BLACK, WHITE, index_of, opposite_color


def test_opposite_color_returns_white_for_black() -> None:
    assert opposite_color(BLACK) == WHITE


def test_opposite_color_returns_black_for_white() -> None:
    assert opposite_color(WHITE) == BLACK


def test_index_of_maps_origin_to_zero() -> None:
    assert index_of(0, 0, 0, 8) == 0


def test_index_of_orders_x_fastest_then_y_then_z() -> None:
    board_size = 8
    assert index_of(1, 0, 0, board_size) == 1
    assert index_of(0, 1, 0, board_size) == board_size
    assert index_of(0, 0, 1, board_size) == board_size**2


def test_index_of_matches_board_js_flat_index_formula() -> None:
    board_size = 8
    x, y, z = 3, 5, 2
    expected = x + y * board_size + z * board_size**2
    assert index_of(x, y, z, board_size) == expected
