"""Elo的指標の計算に使う純粋関数。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「強さ評価とレベル選定（Elo的指標）」節。
"""

from __future__ import annotations

ELO_DIVISOR = 400.0
"""標準的なEloの期待勝率式で使う除数（400点差ごとに期待勝率の比が10倍になる）。"""


def expected_score(rating_a: float, rating_b: float) -> float:
    """標準ロジスティック式で `rating_a` 側の期待勝率を返す。

    Args:
        rating_a: 評価対象側のレーティング。
        rating_b: 相手側のレーティング。

    Returns:
        `rating_a` 側が勝つ期待値（`0.0` 〜 `1.0`、レーティングが等しければ `0.5`）。
    """
    return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / ELO_DIVISOR))


def update_elo_pair(
    rating_a: float, rating_b: float, score_a: float, k_factor: float
) -> tuple[float, float]:
    """1対局分のEloレーティングを更新する。

    `score_a` の相手側スコアは `1 - score_a` とするゼロサム更新（`score_a` の増減分だけ
    `rating_b` が逆向きに増減する）。

    Args:
        rating_a: 対局前の `a` 側のレーティング。
        rating_b: 対局前の `b` 側のレーティング。
        score_a: `a` 側の対局結果（勝ち `1.0` / 負け `0.0` / 引き分け `0.5`）。
        k_factor: 1対局あたりの更新幅を決める係数。

    Returns:
        `(new_rating_a, new_rating_b)` の更新後レーティングのタプル。
    """
    score_b = 1.0 - score_a
    expected_a = expected_score(rating_a, rating_b)
    expected_b = expected_score(rating_b, rating_a)

    new_rating_a = rating_a + k_factor * (score_a - expected_a)
    new_rating_b = rating_b + k_factor * (score_b - expected_b)

    return new_rating_a, new_rating_b
