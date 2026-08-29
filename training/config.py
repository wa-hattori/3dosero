"""学習アルゴリズムのハイパーパラメータの本番用目安値。

正本: `.claude/skills/gan-cpu-self-play/SKILL.md` の「ネットワーク構成」節・
「強さ評価とレベル選定（Elo的指標）」節にある目安値表。数値そのものは正本が
固定するものではなく計算資源に応じて調整してよい旨が明記されているが、この
定数群はSKILL.md記載の目安値をそのまま保持する
（変更する場合はSKILL.mdの表を先に更新すること）。

テストで小さい値を使いたい場合は、この本番用定数を変更するのではなく、テスト
モジュール側にローカル定数を定義して渡すこと（本番目安値と混同しないため）。
"""

RESIDUAL_BLOCKS = 6
BASE_CHANNELS = 64
MCTS_SIMULATIONS_PER_MOVE = 100
PUCT_C = 1.5
DIRICHLET_ALPHA = 0.3
DIRICHLET_EPSILON = 0.25
TEMPERATURE_MOVE_THRESHOLD = 8
CHECKPOINT_INTERVAL_GAMES = 200
BATCH_SIZE = 256
LEARNING_RATE = 1e-3
L2_WEIGHT_DECAY = 1e-4
GAMES_PER_MATCHUP = 4
ELO_BASE_RATING = 1500
ELO_K_FACTOR = 32
