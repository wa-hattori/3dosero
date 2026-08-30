"""Eloレーティングからのチェックポイント難易度レベル選定。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「強さ評価とレベル選定（Elo的指標）」節
（`select_levels` の疑似コード）。レベル1は既存の `chooseRandomMove` を採用するため、
この関数はレベル2〜5に対応する `num_levels`（デフォルト4）件のチェックポイントIDを
最弱から最強の順で返す。

設計上の注記（SKILL.mdが厳密に定義していない部分の解釈）:

- `closest_by_rating` で複数の候補が `target` に対して同じ距離になった場合のタイブレークは
  「チェックポイントID（文字列）の昇順で先に来る方を選ぶ」とする。強さの優劣がつけられない
  タイなので、レーティング辞書の反復順序に依存しない決定論的な結果を優先した。
- SKILL.mdの疑似コードは `target` を最小レーティングから最大レーティングへ単調増加させながら
  `selected` に逐次追加するが、レーティング分布が疎・不均一な場合、この追加順序は
  レーティング昇順と一致するとは限らない（ある回のtargetに最も近い未選出候補が、後の回で
  選ばれる候補よりレーティングが高くなることがありうる）。SKILL.mdのコメントは
  「`selected[0]` が最弱・`selected[-1]` が最強」という不変条件を明言しているため、本実装は
  ループ終了後に `selected` をレーティング昇順（同点はチェックポイントID昇順）で並び替えて
  この不変条件を常に満たす。並び替えても「どのチェックポイントが選ばれるか」は変わらず、
  返す順序だけを正規化する。
"""

from __future__ import annotations

CheckpointId = str


def _closest_unselected(
    ratings: dict[CheckpointId, float], target: float, excluded: set[CheckpointId]
) -> CheckpointId:
    """`excluded` に含まれないチェックポイントのうち、`target` に最も近いレーティングのIDを返す。

    距離が同点の場合はチェックポイントIDの昇順で先に来る方を選ぶ（タイブレーク）。

    Args:
        ratings: `{checkpoint_id: elo_rating}`。
        target: 目標レーティング。
        excluded: 選出済みで候補から除外するチェックポイントIDの集合。

    Returns:
        `target` に最も近いレーティングを持つ、未選出のチェックポイントID。
    """
    candidates = (
        (abs(rating - target), checkpoint_id)
        for checkpoint_id, rating in ratings.items()
        if checkpoint_id not in excluded
    )
    _distance, closest_id = min(candidates, key=lambda candidate: (candidate[0], candidate[1]))
    return closest_id


def select_levels(ratings: dict[CheckpointId, float], num_levels: int = 4) -> list[CheckpointId]:
    """Eloレーティングの最小値・最大値を両端とする均等分割で、代表チェックポイントを選ぶ。

    正本: SKILL.mdの `select_levels` 疑似コード。

    Args:
        ratings: `{checkpoint_id: elo_rating}`（`evaluate_checkpoints` の出力）。
        num_levels: 選定するレベル数（レベル1は `chooseRandomMove` のためここには含まれず、
            デフォルトの `4` はレベル2〜5に対応する）。

    Returns:
        最弱から最強の順に並んだ、`num_levels` 件の相異なるチェックポイントID。
        （`selected[0]` が最弱、`selected[-1]` が最強）。

    Raises:
        ValueError: `num_levels` が `1` 未満、または `ratings` の件数が `num_levels` 未満で、
            相異なる `num_levels` 件のチェックポイントを選べない場合。
    """
    if num_levels < 1:
        raise ValueError(f"num_levels must be at least 1, got {num_levels}")
    if len(ratings) < num_levels:
        raise ValueError(
            f"need at least {num_levels} checkpoints to select {num_levels} levels, "
            f"got {len(ratings)}"
        )

    sorted_ids = sorted(ratings, key=lambda checkpoint_id: ratings[checkpoint_id])
    min_rating = ratings[sorted_ids[0]]
    max_rating = ratings[sorted_ids[-1]]
    rating_span = max_rating - min_rating

    selected: list[CheckpointId] = []
    for i in range(num_levels):
        fraction = i / (num_levels - 1) if num_levels > 1 else 0.0
        target = min_rating + fraction * rating_span
        closest_id = _closest_unselected(ratings, target, set(selected))
        selected.append(closest_id)

    selected.sort(key=lambda checkpoint_id: (ratings[checkpoint_id], checkpoint_id))
    return selected
