"""select_levels.py のユニットテスト。

正本: .claude/skills/gan-cpu-self-play/SKILL.md の「強さ評価とレベル選定（Elo的指標）」節
（`select_levels` の疑似コード）。純粋関数のみで構成されるため、CUDA不要。

タイブレークの挙動（SKILL.mdが明示していない部分）: `target` への距離が同点の候補が
複数ある場合は、チェックポイントID（文字列）の昇順で先に来る方を選ぶ。理由:
どちらを選んでも強さ評価上の優劣はつけられないため、レーティング辞書の反復順序に
依存しない決定論的な結果を保証することを優先した。
"""

import pytest

from training.select_levels import _closest_unselected, select_levels

# --- select_levels ---


def test_select_levels_raises_when_fewer_checkpoints_than_num_levels() -> None:
    ratings = {"a": 1000.0, "b": 1100.0, "c": 1200.0}

    with pytest.raises(ValueError, match="4"):
        select_levels(ratings, num_levels=4)


def test_select_levels_raises_for_an_empty_ratings_dict() -> None:
    with pytest.raises(ValueError):
        select_levels({}, num_levels=4)


def test_select_levels_selects_every_checkpoint_exactly_once_when_pool_size_matches() -> None:
    ratings = {"a": 1000.0, "b": 1100.0, "c": 1200.0, "d": 1300.0}

    selected = select_levels(ratings, num_levels=4)

    assert selected == ["a", "b", "c", "d"]


def test_select_levels_orders_weakest_to_strongest() -> None:
    ratings = {"strong": 2000.0, "mid": 1500.0, "weak": 1000.0, "weakest": 900.0}

    selected = select_levels(ratings, num_levels=4)

    ratings_in_order = [ratings[checkpoint_id] for checkpoint_id in selected]
    assert ratings_in_order == sorted(ratings_in_order)
    assert selected[0] == "weakest"
    assert selected[-1] == "strong"


def test_select_levels_reorders_results_when_the_target_matching_loop_is_out_of_order() -> None:
    # このレーティング分布では、target 1266.67（i=1）に最も近い未選出候補は
    # "mid"(1500, 距離233.3)であり、"weak"(1000, 距離266.7)より近い。そのため
    # target を単調増加させながら逐次選ぶ生のループ順序は [weakest, mid, strong, weak] となり、
    # レーティング昇順にならない。SKILL.mdの「selected[0]が最弱」という不変条件を守るため、
    # 実装はループ後にレーティング昇順へ並び替える（この並び替えは選ばれる集合を変えない）。
    ratings = {"strong": 2000.0, "mid": 1500.0, "weak": 1000.0, "weakest": 900.0}

    selected = select_levels(ratings, num_levels=4)

    assert selected == ["weakest", "weak", "mid", "strong"]


def test_select_levels_returns_distinct_checkpoints() -> None:
    ratings = {f"checkpoint-{i}": float(1000 + i * 10) for i in range(10)}

    selected = select_levels(ratings, num_levels=4)

    assert len(selected) == len(set(selected)) == 4


def test_select_levels_breaks_distance_ties_by_smaller_checkpoint_id() -> None:
    # 全チェックポイントが同一レーティングの場合、どのtargetも常にレーティング差0の
    # タイになるため、タイブレーク（ID昇順）だけで選出順が決まる。
    ratings = {"d": 1500.0, "b": 1500.0, "a": 1500.0, "c": 1500.0}

    selected = select_levels(ratings, num_levels=4)

    assert selected == ["a", "b", "c", "d"]


def test_select_levels_avoids_reselecting_the_same_checkpoint_in_dense_clusters() -> None:
    # "b"と"c"は同一レーティングで、2つのtargetから見て両方とも最も近い候補になりうるが、
    # 既選択の除外により重複せず1回ずつ選ばれる。"d"は5件中4枠なので選ばれない。
    ratings = {"a": 1000.0, "b": 1500.0, "c": 1500.0, "d": 1999.0, "e": 2000.0}

    selected = select_levels(ratings, num_levels=4)

    assert len(selected) == len(set(selected)) == 4
    assert selected == ["a", "b", "c", "e"]


def test_select_levels_with_two_checkpoints_and_two_levels_returns_both_ordered() -> None:
    ratings = {"strong": 1800.0, "weak": 1200.0}

    selected = select_levels(ratings, num_levels=2)

    assert selected == ["weak", "strong"]


# --- _closest_unselected (private helper) ---


def test_closest_unselected_picks_the_nearest_rating() -> None:
    ratings = {"a": 1000.0, "b": 1200.0, "c": 1500.0}

    closest = _closest_unselected(ratings, target=1250.0, excluded=set())

    assert closest == "b"


def test_closest_unselected_ignores_excluded_checkpoints() -> None:
    ratings = {"a": 1000.0, "b": 1200.0, "c": 1500.0}

    closest = _closest_unselected(ratings, target=1400.0, excluded={"b"})

    assert closest == "c"


def test_closest_unselected_breaks_ties_by_smaller_id() -> None:
    ratings = {"z": 1000.0, "a": 2000.0}

    closest = _closest_unselected(ratings, target=1500.0, excluded=set())

    assert closest == "a"
