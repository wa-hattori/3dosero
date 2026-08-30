"""board_encoding.py のユニットテスト。

正本: .claude/skills/gan-cpu-self-play/SKILL.md の「盤面エンコーディング」節。
"""

import torch

from training.board_encoding import BLACK, EMPTY, WHITE, encode_board, index_of


def test_index_of_matches_board_js_flat_index_formula() -> None:
    board_size = 8
    x, y, z = 3, 5, 2
    expected = x + y * board_size + z * board_size**2

    assert index_of(x, y, z, board_size) == expected


def test_index_of_orders_x_fastest_then_y_then_z() -> None:
    board_size = 4

    assert index_of(0, 0, 0, board_size) == 0
    assert index_of(1, 0, 0, board_size) == 1
    assert index_of(0, 1, 0, board_size) == board_size
    assert index_of(0, 0, 1, board_size) == board_size**2


def test_encode_board_returns_expected_shape() -> None:
    board_size = 4
    board = [EMPTY] * board_size**3

    encoded = encode_board(board, BLACK, board_size)

    assert encoded.shape == (2, board_size, board_size, board_size)


def test_encode_board_empty_board_has_all_zero_planes() -> None:
    board_size = 4
    board = [EMPTY] * board_size**3

    encoded = encode_board(board, BLACK, board_size)

    assert torch.count_nonzero(encoded) == 0


def test_encode_board_places_own_stone_on_channel_zero_at_z_y_x() -> None:
    board_size = 4
    x, y, z = 2, 1, 3
    board = [EMPTY] * board_size**3
    board[index_of(x, y, z, board_size)] = BLACK

    encoded = encode_board(board, BLACK, board_size)

    assert encoded[0, z, y, x] == 1.0
    assert encoded[1, z, y, x] == 0.0
    assert torch.count_nonzero(encoded) == 1


def test_encode_board_places_opponent_stone_on_channel_one() -> None:
    board_size = 4
    x, y, z = 2, 1, 3
    board = [EMPTY] * board_size**3
    board[index_of(x, y, z, board_size)] = WHITE

    encoded = encode_board(board, BLACK, board_size)

    assert encoded[0, z, y, x] == 0.0
    assert encoded[1, z, y, x] == 1.0


def test_encode_board_is_asymmetric_between_black_and_white_to_move() -> None:
    board_size = 4
    x, y, z = 0, 0, 0
    board = [EMPTY] * board_size**3
    board[index_of(x, y, z, board_size)] = BLACK

    encoded_for_black = encode_board(board, BLACK, board_size)
    encoded_for_white = encode_board(board, WHITE, board_size)

    assert encoded_for_black[0, z, y, x] == 1.0
    assert encoded_for_white[1, z, y, x] == 1.0
    assert not torch.equal(encoded_for_black, encoded_for_white)


def test_encode_board_full_board_has_no_empty_cells_left_unmarked() -> None:
    board_size = 4
    cell_count = board_size**3
    board = [BLACK if i % 2 == 0 else WHITE for i in range(cell_count)]

    encoded = encode_board(board, BLACK, board_size)

    assert torch.count_nonzero(encoded) == cell_count


def test_encode_board_supports_size_eight_board() -> None:
    board_size = 8
    board = [EMPTY] * board_size**3
    board[index_of(7, 7, 7, board_size)] = WHITE

    encoded = encode_board(board, BLACK, board_size)

    assert encoded.shape == (2, board_size, board_size, board_size)
    assert encoded[1, 7, 7, 7] == 1.0
