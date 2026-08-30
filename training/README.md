# training/

GANベースCPU対戦相手（[CLAUDE.md](../CLAUDE.md) の「CPU対戦相手」参照）の学習コード一式。

- ブラウザ側の `src/` とは独立した領域。`three` やDOM APIは一切登場しない。
- コーディング規約は [python/style-guide.md](../.claude/rules/python/style-guide.md)、テスト方針は [testing.md](../.claude/rules/common/testing.md) の「Python（学習コード）のテスト方針」節を参照。
- 学習アルゴリズム（モデル構成・盤面エンコーディング・MCTS・自己対戦ループ・チェックポイント/レベル選定）の正本は [gan-cpu-self-play](../.claude/skills/gan-cpu-self-play/SKILL.md)。
- 学習済みの重み・チェックポイントファイルはリポジトリにコミットしない（[.gitignore](../.gitignore) 参照）。ブラウザ推論用のONNXファイル（`data/models/`）も同様。

## Docker実行環境

GPU（RTX 4060等、CUDA 12.8対応）で実際に学習・テストを実行する場合は、リポジトリ直下で以下を実行する。`nvidia-container-toolkit` がインストール済みであること（Dockerの `nvidia` runtime登録）が前提。

```bash
docker compose -f training/docker-compose.yml build
docker compose -f training/docker-compose.yml run --rm training pytest
```

GPU版PyTorch公式イメージ（[Dockerfile](Dockerfile)）をベースにし、リポジトリ全体を `/workspace` にマウントするため、ホスト側でコードを編集すればコンテナ再ビルドなしに反映される。依存関係（ruff・pytest以外）が増えた場合は [Dockerfile](Dockerfile) に追記し、`--build` で再ビルドする。

**同じGPUで複数の学習コンテナを同時実行しない。** MCTSは1手ごとに多数の小さな推論呼び出しを逐次実行する（バッチ化していない）ため、CUDAコンテキストが複数並立するとキュー競合で1ゲームあたりの所要時間が数倍に悪化することを確認している（3並列で約4倍、軽量な4×4×4を1つ並走させただけでも顕著な遅延が発生した）。盤面サイズごとに順番に実行すること。

## 学習の実行

```bash
# 新規に学習を開始する(盤面サイズ8、150局、1手あたりMCTS10シミュレーション、15局ごとにチェックポイント保存)
docker compose -f training/docker-compose.yml run --rm -e PYTHONUNBUFFERED=1 training \
  python -m training.run_training --board-size 8 --total-games 150 --num-simulations 10 --checkpoint-interval-games 15

# 既存チェックポイントから続きを学習する(--total-gamesは追加で実行する局数)
docker compose -f training/docker-compose.yml run --rm -e PYTHONUNBUFFERED=1 training \
  python -m training.run_training --board-size 8 --total-games 100 --num-simulations 10 --checkpoint-interval-games 15 \
  --resume-from training/checkpoints/8/game_000150.pt
```

`-e PYTHONUNBUFFERED=1` は、標準出力をファイルにリダイレクトして長時間バックグラウンド実行する際に進捗ログがブロックバッファリングで遅延しないようにするため（ttyでない出力先ではPythonの`print`がデフォルトでブロックバッファになる）。

`--num-simulations`・`--checkpoint-interval-games` は [gan-cpu-self-play](../.claude/skills/gan-cpu-self-play/SKILL.md) 記載の本番目安値（`MCTS_SIMULATIONS_PER_MOVE=100`・`CHECKPOINT_INTERVAL_GAMES=200`、[config.py](config.py) 参照）より小さい値を指定できる。小さくするほど1局あたりの所要時間・棋力は下がるが、短時間でチェックポイントを複数得られる。

## レベルの確定（強さ評価→ONNXエクスポート）

チェックポイントが `num_levels`（デフォルト4）件以上そろったら、Elo評価でレベル2〜5を選定し、ブラウザ推論用のONNXとして書き出す。

```bash
docker compose -f training/docker-compose.yml run --rm -e PYTHONUNBUFFERED=1 training \
  python -m training.finalize_levels --checkpoint-dir training/checkpoints/8 --board-size 8
```

`data/models/8/level{2,3,4,5}.onnx` が書き出される（既存ファイルは上書きされる）。より多くのチェックポイントが増えた後に再実行すれば、レベルの選定・エクスポートをやり直せる。
