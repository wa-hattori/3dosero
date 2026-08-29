"""elo.py のユニットテスト。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「強さ評価とレベル選定（Elo的指標）」節。
"""

import pytest

from training.elo import expected_score, update_elo_pair

# --- expected_score ---


def test_expected_score_is_half_when_ratings_are_equal() -> None:
    assert expected_score(1500.0, 1500.0) == pytest.approx(0.5)


def test_expected_score_is_above_half_when_rating_a_is_higher() -> None:
    assert expected_score(1600.0, 1500.0) > 0.5


def test_expected_score_is_below_half_when_rating_a_is_lower() -> None:
    assert expected_score(1400.0, 1500.0) < 0.5


def test_expected_score_matches_standard_logistic_formula_at_400_point_gap() -> None:
    # 400点差では、標準的なEloの式より約0.909(=10/11)になる。
    assert expected_score(1900.0, 1500.0) == pytest.approx(10 / 11)


def test_expected_score_is_symmetric_around_one_half() -> None:
    a_vs_b = expected_score(1700.0, 1500.0)
    b_vs_a = expected_score(1500.0, 1700.0)

    assert a_vs_b + b_vs_a == pytest.approx(1.0)


def test_expected_score_stays_within_open_unit_interval_for_large_gaps() -> None:
    assert 0.0 < expected_score(3000.0, 0.0) < 1.0
    assert 0.0 < expected_score(0.0, 3000.0) < 1.0


# --- update_elo_pair ---


def test_update_elo_pair_raises_winner_and_lowers_loser_from_equal_ratings() -> None:
    new_a, new_b = update_elo_pair(1500.0, 1500.0, score_a=1.0, k_factor=32.0)

    assert new_a > 1500.0
    assert new_b < 1500.0


def test_update_elo_pair_matches_hand_computed_values_for_equal_ratings_win() -> None:
    new_a, new_b = update_elo_pair(1500.0, 1500.0, score_a=1.0, k_factor=32.0)

    assert new_a == pytest.approx(1516.0)
    assert new_b == pytest.approx(1484.0)


def test_update_elo_pair_leaves_equal_ratings_unchanged_on_draw() -> None:
    new_a, new_b = update_elo_pair(1500.0, 1500.0, score_a=0.5, k_factor=32.0)

    assert new_a == pytest.approx(1500.0)
    assert new_b == pytest.approx(1500.0)


def test_update_elo_pair_is_zero_sum() -> None:
    new_a, new_b = update_elo_pair(1620.0, 1480.0, score_a=0.0, k_factor=24.0)

    assert (new_a - 1620.0) + (new_b - 1480.0) == pytest.approx(0.0)


def test_update_elo_pair_gives_underdog_a_larger_gain_for_an_upset_win() -> None:
    _new_a, new_b_favorite_loses = update_elo_pair(1400.0, 1800.0, score_a=1.0, k_factor=32.0)
    new_a_expected_win, _new_b = update_elo_pair(1800.0, 1400.0, score_a=1.0, k_factor=32.0)

    upset_gain = new_b_favorite_loses - 1800.0
    expected_win_gain = new_a_expected_win - 1800.0

    assert abs(upset_gain) > abs(expected_win_gain)


def test_update_elo_pair_zero_k_factor_never_changes_ratings() -> None:
    new_a, new_b = update_elo_pair(1500.0, 1700.0, score_a=1.0, k_factor=0.0)

    assert new_a == pytest.approx(1500.0)
    assert new_b == pytest.approx(1700.0)
