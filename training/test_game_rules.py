"""game_rules.py のユニットテスト。

正本: .claude/skills/othello-3d-flip-rule/SKILL.md。
`src/logic/board.js` / `flip-rule.js` / `game-state.js` と同じ挙動になることを検証する
（src/logic/*.test.js の代表的なケースをPython側に移植）。
"""

from training.game_rules import (
    BLACK,
    DIRECTIONS_3D,
    EMPTY,
    WHITE,
    apply_move,
    count_stones,
    create_empty_board,
    create_initial_board,
    get_flippable_stones,
    get_next_turn,
    get_valid_moves,
    get_winner,
    has_valid_move,
    index_of,
    is_game_over,
    is_on_board,
    is_valid_move,
    opposite_color,
)


def place(board: list[int], x: int, y: int, z: int, color: int, board_size: int) -> list[int]:
    board[index_of(x, y, z, board_size)] = color
    return board


def sort_stones(stones: list[tuple[int, int, int]]) -> list[tuple[int, int, int]]:
    return sorted(stones)


# --- board-level helpers ---


def test_opposite_color_returns_white_for_black() -> None:
    assert opposite_color(BLACK) == WHITE


def test_opposite_color_returns_black_for_white() -> None:
    assert opposite_color(WHITE) == BLACK


def test_index_of_maps_origin_to_zero() -> None:
    assert index_of(0, 0, 0, 8) == 0


def test_is_on_board_true_for_min_and_max_corner() -> None:
    board_size = 8
    assert is_on_board(0, 0, 0, board_size) is True
    assert is_on_board(board_size - 1, board_size - 1, board_size - 1, board_size) is True


def test_is_on_board_false_when_any_axis_out_of_range() -> None:
    board_size = 8
    assert is_on_board(-1, 0, 0, board_size) is False
    assert is_on_board(board_size, 0, 0, board_size) is False
    assert is_on_board(0, -1, 0, board_size) is False
    assert is_on_board(0, board_size, 0, board_size) is False
    assert is_on_board(0, 0, -1, board_size) is False
    assert is_on_board(0, 0, board_size, board_size) is False


def test_create_empty_board_has_board_size_cubed_cells_all_empty() -> None:
    board_size = 4
    board = create_empty_board(board_size)

    assert len(board) == board_size**3
    assert all(cell == EMPTY for cell in board)


def test_create_initial_board_places_four_black_and_four_white_stones() -> None:
    board_size = 8
    board = create_initial_board(board_size)

    assert board.count(BLACK) == 4
    assert board.count(WHITE) == 4
    assert board.count(EMPTY) == board_size**3 - 8


def test_create_initial_board_colors_center_cells_by_parity() -> None:
    board_size = 8
    board = create_initial_board(board_size)
    cases = [
        (3, 3, 3, BLACK),
        (3, 3, 4, WHITE),
        (4, 4, 4, WHITE),
        (4, 4, 3, BLACK),
    ]
    for x, y, z, expected in cases:
        assert board[index_of(x, y, z, board_size)] == expected


def test_create_initial_board_respects_smaller_board_size() -> None:
    board_size = 4
    board = create_initial_board(board_size)

    assert board.count(BLACK) == 4
    assert board.count(WHITE) == 4
    assert board.count(EMPTY) == board_size**3 - 8


# --- DIRECTIONS_3D ---


def test_directions_3d_has_26_vectors() -> None:
    assert len(DIRECTIONS_3D) == 26


def test_directions_3d_excludes_zero_vector() -> None:
    assert (0, 0, 0) not in DIRECTIONS_3D


def test_directions_3d_has_no_duplicates() -> None:
    assert len(set(DIRECTIONS_3D)) == 26


# --- get_flippable_stones / is_valid_move / apply_move ---


def test_flips_single_opponent_stone_in_a_straight_line() -> None:
    board_size = 8
    board = create_empty_board(board_size)
    board = place(board, 1, 0, 0, WHITE, board_size)
    board = place(board, 2, 0, 0, BLACK, board_size)

    flippable = get_flippable_stones(board, 0, 0, 0, BLACK, board_size)

    assert sort_stones(flippable) == sort_stones([(1, 0, 0)])


def test_does_not_flip_when_adjacent_cell_is_empty() -> None:
    board_size = 8
    board = create_empty_board(board_size)

    assert get_flippable_stones(board, 0, 0, 0, BLACK, board_size) == []


def test_does_not_flip_when_opponent_run_reaches_edge_without_terminator() -> None:
    board_size = 8
    board = place(create_empty_board(board_size), 7, 0, 0, WHITE, board_size)

    assert get_flippable_stones(board, 6, 0, 0, BLACK, board_size) == []


def test_does_not_flip_when_adjacent_cell_is_same_color() -> None:
    board_size = 8
    board = place(create_empty_board(board_size), 1, 0, 0, BLACK, board_size)

    assert get_flippable_stones(board, 0, 0, 0, BLACK, board_size) == []


def test_does_not_allow_placing_on_top_of_existing_stone() -> None:
    board_size = 8
    board = create_empty_board(board_size)
    board = place(board, 0, 0, 0, WHITE, board_size)
    board = place(board, 1, 0, 0, WHITE, board_size)

    assert get_flippable_stones(board, 0, 0, 0, BLACK, board_size) == []


def test_returns_no_flippable_stones_for_out_of_board_target_coordinate() -> None:
    board_size = 8
    board = create_empty_board(board_size)
    board = place(board, 7, 0, 0, WHITE, board_size)
    board = place(board, 6, 0, 0, BLACK, board_size)

    assert get_flippable_stones(board, 8, 0, 0, BLACK, board_size) == []


def test_flips_stones_in_multiple_directions_at_once() -> None:
    board_size = 8
    board = create_empty_board(board_size)
    board = place(board, 2, 3, 0, WHITE, board_size)
    board = place(board, 1, 3, 0, BLACK, board_size)
    board = place(board, 3, 2, 0, WHITE, board_size)
    board = place(board, 3, 1, 0, BLACK, board_size)

    flippable = get_flippable_stones(board, 3, 3, 0, BLACK, board_size)

    assert sort_stones(flippable) == sort_stones([(2, 3, 0), (3, 2, 0)])


def test_flips_opponent_stones_straight_up_through_layers() -> None:
    board_size = 8
    board = create_empty_board(board_size)
    board = place(board, 0, 0, 1, WHITE, board_size)
    board = place(board, 0, 0, 2, BLACK, board_size)

    flippable = get_flippable_stones(board, 0, 0, 0, BLACK, board_size)

    assert sort_stones(flippable) == sort_stones([(0, 0, 1)])


def test_flips_opponent_stones_along_space_diagonal() -> None:
    board_size = 8
    board = create_empty_board(board_size)
    board = place(board, 1, 1, 1, WHITE, board_size)
    board = place(board, 2, 2, 2, BLACK, board_size)

    flippable = get_flippable_stones(board, 0, 0, 0, BLACK, board_size)

    assert sort_stones(flippable) == sort_stones([(1, 1, 1)])


def test_does_not_flip_past_smaller_board_edge_even_if_it_would_alias_to_default_size() -> None:
    # boardSize=4での(2,0,0)->(3,0,0)の相手石の並びは x=4 で盤外になる。ナイーブな
    # 実装がフラットインデックスをデフォルトのBOARD_SIZE基準で扱うと、x=4はindex 4に
    # エイリアスして(0,1,0)を誤って終端石とみなしてしまう。これを防止する境界値テスト。
    board_size = 4
    board = create_empty_board(board_size)
    board = place(board, 2, 0, 0, WHITE, board_size)
    board = place(board, 3, 0, 0, WHITE, board_size)
    board = place(board, 0, 1, 0, BLACK, board_size)

    assert get_flippable_stones(board, 1, 0, 0, BLACK, board_size) == []


def test_is_valid_move_true_when_move_flips_at_least_one_stone() -> None:
    board_size = 8
    board = create_empty_board(board_size)
    board = place(board, 1, 0, 0, WHITE, board_size)
    board = place(board, 2, 0, 0, BLACK, board_size)

    assert is_valid_move(board, 0, 0, 0, BLACK, board_size) is True


def test_is_valid_move_false_when_move_flips_no_stones() -> None:
    board_size = 8
    board = create_empty_board(board_size)

    assert is_valid_move(board, 0, 0, 0, BLACK, board_size) is False


def test_apply_move_places_the_stone_and_flips_captured_stones() -> None:
    board_size = 8
    board = create_empty_board(board_size)
    board = place(board, 1, 0, 0, WHITE, board_size)
    board = place(board, 2, 0, 0, BLACK, board_size)

    next_board = apply_move(board, 0, 0, 0, BLACK, board_size)

    assert next_board is not None
    assert next_board[index_of(0, 0, 0, board_size)] == BLACK
    assert next_board[index_of(1, 0, 0, board_size)] == BLACK
    assert next_board[index_of(2, 0, 0, board_size)] == BLACK


def test_apply_move_does_not_mutate_the_board_passed_in() -> None:
    board_size = 8
    board = create_empty_board(board_size)
    board = place(board, 1, 0, 0, WHITE, board_size)
    board = place(board, 2, 0, 0, BLACK, board_size)

    apply_move(board, 0, 0, 0, BLACK, board_size)

    assert board[index_of(0, 0, 0, board_size)] == EMPTY
    assert board[index_of(1, 0, 0, board_size)] == WHITE


def test_apply_move_returns_none_for_invalid_move() -> None:
    board_size = 8
    board = create_empty_board(board_size)

    assert apply_move(board, 0, 0, 0, BLACK, board_size) is None


def test_get_valid_moves_finds_no_moves_on_empty_board() -> None:
    board_size = 8
    board = create_empty_board(board_size)

    assert get_valid_moves(board, BLACK, board_size) == []


def test_get_valid_moves_on_initial_board_agrees_with_is_valid_move() -> None:
    board_size = 8
    board = create_initial_board(board_size)

    moves = get_valid_moves(board, BLACK, board_size)

    assert len(moves) > 0
    assert all(is_valid_move(board, x, y, z, BLACK, board_size) for x, y, z in moves)


def test_has_valid_move_true_when_at_least_one_legal_move_exists() -> None:
    board_size = 8
    board = create_empty_board(board_size)
    board = place(board, 1, 0, 0, WHITE, board_size)
    board = place(board, 2, 0, 0, BLACK, board_size)

    assert has_valid_move(board, BLACK, board_size) is True


def test_has_valid_move_false_when_no_legal_move_exists() -> None:
    board_size = 8
    board = create_empty_board(board_size)

    assert has_valid_move(board, BLACK, board_size) is False


# --- game-state level helpers ---


def test_count_stones_counts_each_color() -> None:
    board_size = 8
    board = create_initial_board(board_size)

    counts = count_stones(board)

    assert counts[BLACK] == 4
    assert counts[WHITE] == 4


def test_get_winner_returns_color_with_more_stones() -> None:
    board_size = 8
    board = create_empty_board(board_size)
    board = place(board, 0, 0, 0, BLACK, board_size)
    board = place(board, 1, 0, 0, BLACK, board_size)
    board = place(board, 2, 0, 0, WHITE, board_size)

    assert get_winner(board) == BLACK


def test_get_winner_returns_none_on_a_tie() -> None:
    board_size = 8
    board = create_initial_board(board_size)

    assert get_winner(board) is None


def test_is_game_over_true_when_board_is_full() -> None:
    board_size = 4
    board = [BLACK] * (board_size**3)

    assert is_game_over(board, board_size) is True


def test_is_game_over_false_at_initial_board() -> None:
    board_size = 8
    board = create_initial_board(board_size)

    assert is_game_over(board, board_size) is False


def test_get_next_turn_returns_opponent_when_opponent_has_a_move() -> None:
    board_size = 8
    board = create_initial_board(board_size)

    assert get_next_turn(board, BLACK, board_size) == WHITE


def test_get_next_turn_returns_none_when_neither_side_has_a_move() -> None:
    board_size = 4
    board = [BLACK] * (board_size**3)

    assert get_next_turn(board, BLACK, board_size) is None


def test_get_flippable_stones_respects_a_smaller_board_size() -> None:
    board_size = 4
    board = create_empty_board(board_size)
    board = place(board, 1, 0, 0, WHITE, board_size)
    board = place(board, 2, 0, 0, BLACK, board_size)

    flippable = get_flippable_stones(board, 0, 0, 0, BLACK, board_size)

    assert sort_stones(flippable) == sort_stones([(1, 0, 0)])
