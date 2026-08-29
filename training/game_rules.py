"""3D立体オセロの盤面・着手・反転・勝敗判定ロジックのPython移植。

正本:
- 反転アルゴリズム: `.claude/skills/othello-3d-flip-rule/SKILL.md`
- 各関数の対応元: `src/logic/board.js`, `src/logic/flip-rule.js`, `src/logic/game-state.js`

学習コード側で独自にルールを再導出せず、JS側の関数と1対1に対応させて移植する
（gan-cpu-self-playスキルの「スコープと前提」節）。盤面は `src/logic/board.js` の
`Int8Array` 相当として `list[int]` で表現する。
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


def coords_from_index(index: int, board_size: int) -> tuple[int, int, int]:
    """`index_of` の逆変換。フラットなインデックスを3D座標に変換する。

    Args:
        index: `index_of(x, y, z, board_size)` で得られるインデックス。
        board_size: 盤面の1辺のマス数。

    Returns:
        `(x, y, z)` 座標のタプル。
    """
    x = index % board_size
    y = (index // board_size) % board_size
    z = index // (board_size**2)
    return x, y, z


def is_on_board(x: int, y: int, z: int, board_size: int) -> bool:
    """座標が盤面の範囲内かどうかを判定する。

    Args:
        x: x座標。
        y: y座標。
        z: z座標。
        board_size: 盤面の1辺のマス数。

    Returns:
        x, y, z すべてが `[0, board_size)` に収まっていれば `True`。
    """
    if x < 0 or x >= board_size:
        return False
    if y < 0 or y >= board_size:
        return False
    if z < 0 or z >= board_size:
        return False
    return True


def create_empty_board(board_size: int) -> list[int]:
    """全マスが `EMPTY` の盤面を新規生成する。

    Args:
        board_size: 盤面の1辺のマス数。

    Returns:
        長さ `board_size ** 3` の盤面リスト。
    """
    return [EMPTY] * (board_size**3)


def create_initial_board(board_size: int) -> list[int]:
    """初期配置を適用した盤面を生成する。

    中心の2×2×2キューブに石を置き、`(x + y + z)` が偶数なら `WHITE`、奇数なら
    `BLACK` とする（`src/logic/board.js` の `createInitialBoard` と同じ規約。
    `board_size` は偶数である必要がある）。

    Args:
        board_size: 盤面の1辺のマス数（偶数）。

    Returns:
        初期配置済みの盤面リスト。
    """
    board = create_empty_board(board_size)
    center_coords = [board_size // 2 - 1, board_size // 2]

    for x in center_coords:
        for y in center_coords:
            for z in center_coords:
                color = WHITE if (x + y + z) % 2 == 0 else BLACK
                board[index_of(x, y, z, board_size)] = color

    return board


def _build_directions_3d() -> list[tuple[int, int, int]]:
    directions = []
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0 and dz == 0:
                    continue
                directions.append((dx, dy, dz))
    return directions


DIRECTIONS_3D: list[tuple[int, int, int]] = _build_directions_3d()
"""26方向の探索ベクトル。正本: othello-3d-flip-rule SKILL.md。"""


def get_flippable_stones(
    board: list[int], x0: int, y0: int, z0: int, color: int, board_size: int
) -> list[tuple[int, int, int]]:
    """指定した座標に `color` の石を置いた場合に反転する座標一覧を返す。

    アルゴリズムの正本: `.claude/skills/othello-3d-flip-rule/SKILL.md`。

    Args:
        board: 現在の盤面状態。
        x0: 石を置くx座標。
        y0: 石を置くy座標。
        z0: 石を置くz座標。
        color: 置く石の色（`BLACK` または `WHITE`）。
        board_size: 盤面の1辺のマス数。

    Returns:
        反転対象の座標一覧（置けない場合は空リスト）。
    """
    if not is_on_board(x0, y0, z0, board_size):
        return []
    if board[index_of(x0, y0, z0, board_size)] != EMPTY:
        return []

    opponent = opposite_color(color)
    flippable: list[tuple[int, int, int]] = []

    for dx, dy, dz in DIRECTIONS_3D:
        line: list[tuple[int, int, int]] = []
        x, y, z = x0 + dx, y0 + dy, z0 + dz

        while is_on_board(x, y, z, board_size) and board[index_of(x, y, z, board_size)] == opponent:
            line.append((x, y, z))
            x, y, z = x + dx, y + dy, z + dz

        if (
            line
            and is_on_board(x, y, z, board_size)
            and board[index_of(x, y, z, board_size)] == color
        ):
            flippable.extend(line)

    return flippable


def is_valid_move(board: list[int], x0: int, y0: int, z0: int, color: int, board_size: int) -> bool:
    """指定した座標に `color` の石を置けるかどうかを判定する。

    Args:
        board: 現在の盤面状態。
        x0: 判定するx座標。
        y0: 判定するy座標。
        z0: 判定するz座標。
        color: 置く石の色（`BLACK` または `WHITE`）。
        board_size: 盤面の1辺のマス数。

    Returns:
        1マス以上反転できる、着手可能な手であれば `True`。
    """
    return len(get_flippable_stones(board, x0, y0, z0, color, board_size)) > 0


def apply_move(
    board: list[int], x0: int, y0: int, z0: int, color: int, board_size: int
) -> list[int] | None:
    """指定した座標に `color` の石を置き、挟んだ相手石をすべて反転した新しい盤面を返す。

    引数の `board` は書き換えない。

    Args:
        board: 現在の盤面状態。
        x0: 石を置くx座標。
        y0: 石を置くy座標。
        z0: 石を置くz座標。
        color: 置く石の色（`BLACK` または `WHITE`）。
        board_size: 盤面の1辺のマス数。

    Returns:
        着手後の新しい盤面。無効な手の場合は `None`。
    """
    flippable = get_flippable_stones(board, x0, y0, z0, color, board_size)
    if not flippable:
        return None

    next_board = list(board)
    next_board[index_of(x0, y0, z0, board_size)] = color
    for x, y, z in flippable:
        next_board[index_of(x, y, z, board_size)] = color

    return next_board


def get_valid_moves(board: list[int], color: int, board_size: int) -> list[tuple[int, int, int]]:
    """`color` が着手可能な座標をすべて列挙する。

    Args:
        board: 現在の盤面状態。
        color: 手番の色（`BLACK` または `WHITE`）。
        board_size: 盤面の1辺のマス数。

    Returns:
        着手可能な座標一覧。
    """
    moves: list[tuple[int, int, int]] = []

    for z in range(board_size):
        for y in range(board_size):
            for x in range(board_size):
                if is_valid_move(board, x, y, z, color, board_size):
                    moves.append((x, y, z))

    return moves


def has_valid_move(board: list[int], color: int, board_size: int) -> bool:
    """`color` に着手可能な手が1つでもあるかどうかを判定する。

    Args:
        board: 現在の盤面状態。
        color: 手番の色（`BLACK` または `WHITE`）。
        board_size: 盤面の1辺のマス数。

    Returns:
        着手可能な手が1つ以上あれば `True`。
    """
    return len(get_valid_moves(board, color, board_size)) > 0


def count_stones(board: list[int]) -> dict[int, int]:
    """盤面上の各色の石数を数える。

    Args:
        board: 現在の盤面状態。

    Returns:
        色ごとの石数（`{BLACK: n, WHITE: n}`）。
    """
    counts = {BLACK: 0, WHITE: 0}
    for cell in board:
        if cell == BLACK:
            counts[BLACK] += 1
        elif cell == WHITE:
            counts[WHITE] += 1
    return counts


def get_winner(board: list[int]) -> int | None:
    """石数が多い方の色を返す。

    Args:
        board: 現在の盤面状態。

    Returns:
        石数が多い方の色（`BLACK` または `WHITE`）。同数なら `None`。
    """
    counts = count_stones(board)
    if counts[BLACK] > counts[WHITE]:
        return BLACK
    if counts[WHITE] > counts[BLACK]:
        return WHITE
    return None


def is_game_over(board: list[int], board_size: int) -> bool:
    """ゲームが終了しているかどうかを判定する。

    両者とも着手可能な手が1つもなければ終了（盤面が満杯の場合も、この条件で
    自動的に含まれる）。

    Args:
        board: 現在の盤面状態。
        board_size: 盤面の1辺のマス数。

    Returns:
        ゲームが終了していれば `True`。
    """
    return not has_valid_move(board, BLACK, board_size) and not has_valid_move(
        board, WHITE, board_size
    )


def get_next_turn(board: list[int], just_moved_color: int, board_size: int) -> int | None:
    """直前に `just_moved_color` が着手した後の、次の手番を返す。

    相手に着手可能な手があれば相手番、なければ（相手がパス）自分に着手可能な手が
    あれば自分番、どちらも着手できなければゲーム終了として `None` を返す。

    Args:
        board: 現在の盤面状態。
        just_moved_color: 直前に着手した色（`BLACK` または `WHITE`）。
        board_size: 盤面の1辺のマス数。

    Returns:
        次の手番の色。ゲーム終了の場合は `None`。
    """
    opponent = opposite_color(just_moved_color)
    if has_valid_move(board, opponent, board_size):
        return opponent
    if has_valid_move(board, just_moved_color, board_size):
        return just_moved_color
    return None
