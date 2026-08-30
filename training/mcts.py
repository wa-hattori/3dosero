"""PUCTベースのMCTS実装。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「MCTS（探索、疑似コード）」節。
合法手のみを子ノードにすること・パス局面の扱い・終局判定は同節の疑似コード通りに
実装する。

設計上の注記（SKILL.mdが厳密に定義していない部分の解釈）:

- SKILL.mdの疑似コードは、パス局面（`not has_valid_move`）に遭遇したleafを
  「展開せずに」評価するとし、`value = -mcts_search(board, opposite(color),
  network, remaining_simulations)` という再帰呼び出しで評価値を得るとしている。
  しかし `mcts_search` の宣言上の戻り値は探索方策（`normalized_visit_counts`）
  であり、そのままではスカラーの評価値として使えない。本実装では、この再帰探索を
  内部ヘルパー `_run_simulations` が返す「探索済みルートノード」から
  `root.mean_value`（そのルートの手番視点での平均評価値）を取り出して符号反転した
  値を使う。これは「パス局面のleafを展開しない」という指示は文字通り守りつつ
  （このleaf自身は子を持たない）、実際に評価値を得るための現実的な実装である。
- `remaining_simulations`（再帰時に残っているべきシミュレーション回数）も
  SKILL.mdは明示していない。**当初は外側の`num_simulations`をそのまま再帰呼び出しに
  使っていたが、実運用（実際のGPU上での自己対戦・強さ評価）で致命的な問題が判明した
  ため`PASS_RECURSION_SIMULATION_BUDGET`（目安値4、`config.py`）という独立した小さい
  固定予算に変更した。** パス局面の再帰探索はそれ自体が`num_simulations`回のシミュ
  レーションを行い、そのシミュレーションの一部が「さらに別のパス局面」に到達すると
  同じ規模で再帰する。パス発生率が無視できない盤面（特に盤面が埋まってくる終盤や、
  探索ノイズ・温度なしの決定論的な強さ評価対局）では、この再帰が
  `num_simulations`のべき乗オーダーで増大し得ることを実測で確認した
  （例: 盤面サイズ8の対局1局が数十分単位で停止して見えるほど遅くなるケースが
  複数回発生した）。`is_game_over`が先にFalseであることを確認済みのため手番交代後の
  色には必ず合法手が存在し、どの予算でも再帰は必ず有限の手数で終了するが、
  「有限」であることと「実用的な時間で終わる」ことは別問題である。
  `PASS_RECURSION_SIMULATION_BUDGET`は自己対戦・評価の両方で共通のデフォルトとして
  使い、この小さい予算は再帰のたびに引き継がれる（深い再帰でも`num_simulations`に
  膨れ上がって戻らない）。
- **上記の固定予算化だけでは、再帰の「深さ」自体は制限されない。** パス局面が連鎖する
  盤面（特に盤面サイズが小さいほど終盤の空きマスが少なく、双方の合法手が頻繁に尽きる
  傾向がある）では、`_evaluate_leaf`のパス分岐が入れ子の`_run_simulations`を呼び、
  その中の各シミュレーションがさらに別のパス局面に到達してまた入れ子の
  `_run_simulations`を呼ぶ、という再帰が何段も連鎖しうる。1段あたりの幅を
  `PASS_RECURSION_SIMULATION_BUDGET`（例: 4）に固定しても、深さ`d`まで連鎖すれば
  最悪`PASS_RECURSION_SIMULATION_BUDGET ** d`回のネットワーク評価に達し、深さに
  上限がなければ実質的に終わらない。実際に盤面サイズ4の自己対戦で、この再帰が
  9段以上深くなり1局が20分以上停止して見える事例が実測された（`py-spy dump`で
  `_evaluate_leaf`→`_run_simulations`の呼び出しが9回連続でスタックに積まれている
  ことを確認）。そのため`PASS_RECURSION_MAX_DEPTH`（目安値3、`config.py`）で再帰の
  深さそのものにも上限を設け、使い切ったら入れ子の探索をせず単発の
  `predict`（ネットワークによる価値の一発評価）で代用する。幅・深さの両方を固定
  予算にすることで、パス局面1回あたりの追加コストは
  `sum(PASS_RECURSION_SIMULATION_BUDGET ** d for d in range(PASS_RECURSION_MAX_DEPTH + 1))`
  程度（目安値なら100回未満）に確実に収まる。
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import torch
import torch.nn.functional as functional

from training.board_encoding import encode_board
from training.config import (
    DIRICHLET_ALPHA,
    DIRICHLET_EPSILON,
    PASS_RECURSION_MAX_DEPTH,
    PASS_RECURSION_SIMULATION_BUDGET,
    PUCT_C,
)
from training.game_rules import (
    apply_move,
    get_valid_moves,
    get_winner,
    has_valid_move,
    index_of,
    is_game_over,
    opposite_color,
)
from training.network import PolicyValueNetwork

Move = tuple[int, int, int]


@dataclass
class MCTSNode:
    """MCTS探索木のノード。

    盤面・手番はノード自身には持たせず、選択パスを辿りながら外側の探索ループが
    `apply_move`/`opposite_color` で計算する（SKILL.mdの疑似コードと同じ設計）。
    """

    prior: float
    children: dict[Move, MCTSNode] = field(default_factory=dict)
    visit_count: int = 0
    value_sum: float = 0.0

    @property
    def is_expanded(self) -> bool:
        """このノードが1つ以上の子を持つ（展開済みである）かどうか。"""
        return len(self.children) > 0

    @property
    def mean_value(self) -> float:
        """このノードの手番視点での平均評価値。未訪問なら `0.0`。"""
        if self.visit_count == 0:
            return 0.0
        return self.value_sum / self.visit_count


def terminal_value_for(winner: int | None, color: int) -> float:
    """勝者と評価対象の色から、その色視点の終局価値を返す。

    Args:
        winner: `get_winner` が返した勝者（引き分けなら `None`）。
        color: 評価対象の色。

    Returns:
        `color` が勝者なら `1.0`、敗者なら `-1.0`、引き分けなら `0.0`。
    """
    if winner is None:
        return 0.0
    return 1.0 if winner == color else -1.0


def terminal_value(board: list[int], color: int) -> float:
    """終局した盤面を `color` 視点で評価する。

    Args:
        board: 終局済みの盤面状態。
        color: 評価対象の色。

    Returns:
        `color` 視点の終局価値（`terminal_value_for` 参照）。
    """
    return terminal_value_for(get_winner(board), color)


def predict(
    network: PolicyValueNetwork,
    board: list[int],
    color: int,
    board_size: int,
    device: torch.device,
) -> tuple[np.ndarray, float]:
    """ネットワークで盤面を評価し、全マスに対するsoftmax方策と価値を返す。

    合法手による絞り込みはここでは行わない。`expand` が `get_valid_moves` の
    結果だけを子ノードにすることで、探索木・教師信号を合法手だけに制限する
    （SKILL.mdエッジケース5）。

    Args:
        network: 評価に使う方策/価値ネットワーク。
        board: 現在の盤面状態。
        color: 評価対象の手番の色。
        board_size: 盤面の1辺のマス数。
        device: 推論を実行するデバイス。

    Returns:
        `(policy_probs, value)`。`policy_probs` は shape `(board_size ** 3,)` の
        numpy配列（`index_of` 順、全マスに対するsoftmax）。`value` は `color` 視点の
        期待勝敗を表すスカラー。
    """
    network.eval()
    encoded = encode_board(board, color, board_size).unsqueeze(0).to(device)
    with torch.no_grad():
        policy_logits, value = network(encoded)
        policy_probs = functional.softmax(policy_logits, dim=-1)
    return policy_probs.squeeze(0).cpu().numpy(), float(value.item())


def expand(
    node: MCTSNode,
    board: list[int],
    color: int,
    policy_probs: np.ndarray,
    board_size: int,
) -> None:
    """`get_valid_moves` で得た合法手だけを子ノードにする。

    合法手に対応する方策確率の合計で正規化し、事前確率（prior）とする。方策の
    生出力は非合法手にも非ゼロ確率を割り当てうるため（SKILL.mdエッジケース5）、
    正規化の合計がほぼ0の場合（数値的に極端なケース）は一様分布にフォールバックする。

    Args:
        node: 展開対象のノード。
        board: `node` に対応する盤面状態。
        color: `node` の手番の色。
        policy_probs: `predict` が返した全マスに対するsoftmax方策。
        board_size: 盤面の1辺のマス数。
    """
    legal_moves = get_valid_moves(board, color, board_size)
    if not legal_moves:
        return

    raw_priors = [float(policy_probs[index_of(x, y, z, board_size)]) for x, y, z in legal_moves]
    total = sum(raw_priors)

    for move, raw_prior in zip(legal_moves, raw_priors, strict=True):
        prior = raw_prior / total if total > 1e-8 else 1.0 / len(legal_moves)
        node.children[move] = MCTSNode(prior=prior)


def add_dirichlet_noise(
    root: MCTSNode,
    alpha: float = DIRICHLET_ALPHA,
    epsilon: float = DIRICHLET_EPSILON,
    rng: np.random.Generator | None = None,
) -> None:
    """ルートノードの子の事前確率にDirichletノイズを混ぜる（探索のみに適用）。

    Args:
        root: ルートノード（展開済みであること。子が無ければ何もしない）。
        alpha: Dirichlet分布の集中度パラメータ。
        epsilon: ノイズの混合比率（`0` なら完全にノイズなし）。
        rng: 乱数生成器。省略時は新規生成する。
    """
    if not root.children:
        return

    rng = rng if rng is not None else np.random.default_rng()
    moves = list(root.children.keys())
    noise = rng.dirichlet([alpha] * len(moves))

    for move, noise_value in zip(moves, noise, strict=True):
        child = root.children[move]
        child.prior = (1 - epsilon) * child.prior + epsilon * float(noise_value)


def select_child_by_puct(node: MCTSNode, puct_c: float) -> tuple[Move, MCTSNode]:
    """PUCTスコアが最大の子を選ぶ。

    子の平均価値 `mean_value` は子自身の手番視点のため、親（`node`）視点で
    比較する際は符号を反転する。

    Args:
        node: 選択元のノード（展開済みであること）。
        puct_c: 探索と活用のバランスを決める定数。

    Returns:
        `(move, child)` のタプル。
    """
    parent_visits_sqrt = math.sqrt(node.visit_count)

    def puct_score(child: MCTSNode) -> float:
        q_value = -child.mean_value
        exploration = puct_c * child.prior * parent_visits_sqrt / (1 + child.visit_count)
        return q_value + exploration

    return max(node.children.items(), key=lambda item: puct_score(item[1]))


def normalized_visit_counts(root: MCTSNode) -> dict[Move, float]:
    """ルートの子の訪問回数を正規化した分布を返す（学習の教師信号）。

    Args:
        root: ルートノード。

    Returns:
        `{move: visit_count / total_visits}`。総訪問回数が0なら全手を`0.0`とする。
    """
    total_visits = sum(child.visit_count for child in root.children.values())
    if total_visits == 0:
        return dict.fromkeys(root.children, 0.0)
    return {move: child.visit_count / total_visits for move, child in root.children.items()}


def _evaluate_leaf(
    node: MCTSNode,
    board: list[int],
    color: int,
    network: PolicyValueNetwork,
    board_size: int,
    device: torch.device,
    puct_c: float,
    rng: np.random.Generator,
    pass_recursion_budget: int = PASS_RECURSION_SIMULATION_BUDGET,
    pass_recursion_depth_remaining: int = PASS_RECURSION_MAX_DEPTH,
) -> float:
    """選択で辿り着いたleafを「展開 + 評価」し、`color` 視点の評価値を返す。

    Args:
        node: 評価対象のleafノード（未展開）。
        board: `node` に対応する盤面状態。
        color: `node` の手番の色。
        network: 評価に使う方策/価値ネットワーク。
        board_size: 盤面の1辺のマス数。
        device: 推論を実行するデバイス。
        puct_c: PUCT定数。
        rng: 乱数生成器。
        pass_recursion_budget: パス局面の再帰探索に使うシミュレーション回数。
            `num_simulations`をそのまま使うと再帰が`num_simulations`のべき乗
            オーダーで増大しうるため、独立した小さい固定予算にする
            （モジュールdocstring参照）。
        pass_recursion_depth_remaining: パス局面の再帰探索があと何段まで許されるか。
            `0`になったら、それ以上入れ子の探索はせず単発の`predict`で代用する
            （幅だけでなく深さも有限にする理由はモジュールdocstring参照）。

    Returns:
        `color` 視点の評価値（`[-1, 1]` の範囲を想定）。
    """
    if is_game_over(board, board_size):
        return terminal_value(board, color)

    if not has_valid_move(board, color, board_size):
        # パス局面: このleaf自身は展開せず、手番だけ交代して評価する。
        # is_game_over が False だったため、交代後の色には必ず合法手がある。
        if pass_recursion_depth_remaining <= 0:
            # 深さ予算を使い切った: これ以上入れ子の探索はせず、単発のネットワーク
            # 評価だけで評価値を代用する（パス連鎖が続く病的な盤面でも、幅の予算
            # だけでは再帰の深さが有限にならないため。モジュールdocstring参照）。
            _, pass_value = predict(network, board, opposite_color(color), board_size, device)
            return -pass_value

        # 予算は num_simulations ではなく pass_recursion_budget を使い、かつ
        # 再帰呼び出しにも同じ小さい予算を引き継ぐことで、深い再帰でも
        # num_simulations に膨れ上がらないようにする。深さ予算は1段ごとに
        # 消費し、使い切ったら上のフォールバックに落ちる。
        nested_root = _run_simulations(
            board,
            opposite_color(color),
            network,
            board_size,
            pass_recursion_budget,
            device,
            puct_c=puct_c,
            add_noise=False,
            rng=rng,
            pass_recursion_budget=pass_recursion_budget,
            pass_recursion_depth_remaining=pass_recursion_depth_remaining - 1,
        )
        return -nested_root.mean_value

    policy, leaf_value = predict(network, board, color, board_size, device)
    expand(node, board, color, policy, board_size)
    return leaf_value


def _run_simulations(
    root_board: list[int],
    root_color: int,
    network: PolicyValueNetwork,
    board_size: int,
    num_simulations: int,
    device: torch.device,
    puct_c: float,
    add_noise: bool,
    rng: np.random.Generator,
    dirichlet_alpha: float = DIRICHLET_ALPHA,
    dirichlet_epsilon: float = DIRICHLET_EPSILON,
    pass_recursion_budget: int = PASS_RECURSION_SIMULATION_BUDGET,
    pass_recursion_depth_remaining: int = PASS_RECURSION_MAX_DEPTH,
) -> MCTSNode:
    """`num_simulations` 回のMCTSシミュレーションを実行し、探索済みルートを返す。

    `root_board` は `root_color` に着手可能な手が1つ以上あることを前提とする
    （呼び出し側で `has_valid_move` を確認済みであること）。

    Args:
        root_board: 探索開始局面の盤面状態。
        root_color: 探索開始局面の手番の色。
        network: 局面評価に使う方策/価値ネットワーク。
        board_size: 盤面の1辺のマス数。
        num_simulations: シミュレーション回数。
        device: 推論を実行するデバイス。
        puct_c: PUCT定数。
        add_noise: `True` ならルートにDirichletノイズを加える。
        rng: 乱数生成器。
        dirichlet_alpha: ルートに加えるDirichletノイズの集中度パラメータ。
        dirichlet_epsilon: ルートに加えるDirichletノイズの混合比率。
        pass_recursion_budget: パス局面に遭遇した際の再帰探索に使う、
            `num_simulations`とは独立した小さいシミュレーション予算
            （モジュールdocstring参照）。
        pass_recursion_depth_remaining: パス局面の再帰探索があと何段まで
            許されるか（モジュールdocstring参照）。

    Returns:
        探索済みのルートノード（`visit_count`/`value_sum` が更新済み）。
    """
    root = MCTSNode(prior=1.0)
    root_policy, _root_value = predict(network, root_board, root_color, board_size, device)
    expand(root, root_board, root_color, root_policy, board_size)
    if add_noise:
        add_dirichlet_noise(root, dirichlet_alpha, dirichlet_epsilon, rng)

    for _ in range(num_simulations):
        node = root
        board = list(root_board)
        color = root_color
        path = [node]

        while node.is_expanded:
            move, node = select_child_by_puct(node, puct_c)
            board = apply_move(board, move[0], move[1], move[2], color, board_size)
            color = opposite_color(color)
            path.append(node)

        value = _evaluate_leaf(
            node,
            board,
            color,
            network,
            board_size,
            device,
            puct_c,
            rng,
            pass_recursion_budget,
            pass_recursion_depth_remaining,
        )

        for path_node in reversed(path):
            path_node.visit_count += 1
            path_node.value_sum += value
            value = -value

    return root


def mcts_search(
    root_board: list[int],
    root_color: int,
    network: PolicyValueNetwork,
    board_size: int,
    num_simulations: int,
    device: torch.device,
    puct_c: float = PUCT_C,
    dirichlet_alpha: float = DIRICHLET_ALPHA,
    dirichlet_epsilon: float = DIRICHLET_EPSILON,
    add_noise: bool = True,
    rng: np.random.Generator | None = None,
    pass_recursion_budget: int = PASS_RECURSION_SIMULATION_BUDGET,
    pass_recursion_depth_remaining: int = PASS_RECURSION_MAX_DEPTH,
) -> dict[Move, float]:
    """PUCTベースのMCTSを実行し、ルートの正規化済み訪問回数分布を返す。

    正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「MCTS（探索、疑似コード）」節。

    Args:
        root_board: 探索開始局面の盤面状態（`root_color` に着手可能な手が
            1つ以上あること。呼び出し側で `has_valid_move` を確認しておく）。
        root_color: 探索開始局面の手番の色。
        network: 局面評価に使う方策/価値ネットワーク。
        board_size: 盤面の1辺のマス数。
        num_simulations: シミュレーション回数。
        device: 推論を実行するデバイス。
        puct_c: PUCT定数。
        dirichlet_alpha: ルートに加えるDirichletノイズの集中度パラメータ。
        dirichlet_epsilon: ルートに加えるDirichletノイズの混合比率。
        add_noise: `True` ならルートにDirichletノイズを加える（自己対戦時のみ。
            強さ評価やパス局面からの再帰探索では `False` にする）。
        rng: 乱数生成器。省略時は新規生成する。
        pass_recursion_budget: パス局面に遭遇した際の再帰探索に使う、
            `num_simulations`とは独立した小さいシミュレーション予算
            （モジュールdocstring参照。既定値は`config.PASS_RECURSION_SIMULATION_BUDGET`）。
        pass_recursion_depth_remaining: パス局面の再帰探索があと何段まで
            許されるか（モジュールdocstring参照。既定値は
            `config.PASS_RECURSION_MAX_DEPTH`）。

    Returns:
        `{move: normalized_visit_count}`。合法手だけがキーに含まれる。
    """
    rng = rng if rng is not None else np.random.default_rng()
    root = _run_simulations(
        root_board,
        root_color,
        network,
        board_size,
        num_simulations,
        device,
        puct_c,
        add_noise,
        rng,
        dirichlet_alpha,
        dirichlet_epsilon,
        pass_recursion_budget,
        pass_recursion_depth_remaining,
    )
    return normalized_visit_counts(root)
