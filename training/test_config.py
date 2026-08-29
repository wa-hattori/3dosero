"""config.py のユニットテスト。

SKILL.mdの目安値表からの意図しない乖離を防ぐための固定値チェック。
正本: .claude/skills/gan-cpu-self-play/SKILL.md の「ネットワーク構成」節・
「強さ評価とレベル選定（Elo的指標）」節。
"""

from training import config


def test_hyperparameter_defaults_match_skill_md_table() -> None:
    assert config.RESIDUAL_BLOCKS == 6
    assert config.BASE_CHANNELS == 64
    assert config.MCTS_SIMULATIONS_PER_MOVE == 100
    assert config.PUCT_C == 1.5
    assert config.DIRICHLET_ALPHA == 0.3
    assert config.DIRICHLET_EPSILON == 0.25
    assert config.TEMPERATURE_MOVE_THRESHOLD == 8
    assert config.CHECKPOINT_INTERVAL_GAMES == 200
    assert config.BATCH_SIZE == 256
    assert config.LEARNING_RATE == 1e-3
    assert config.L2_WEIGHT_DECAY == 1e-4


def test_elo_defaults_match_skill_md_table() -> None:
    assert config.GAMES_PER_MATCHUP == 4
    assert config.ELO_BASE_RATING == 1500
    assert config.ELO_K_FACTOR == 32
