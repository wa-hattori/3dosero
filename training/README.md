# training/

GANベースCPU対戦相手（[CLAUDE.md](../CLAUDE.md) の「将来構想」参照）の学習コード一式。

- ブラウザ側の `src/` とは独立した領域。`three` やDOM APIは一切登場しない。
- コーディング規約は [python/style-guide.md](../.claude/rules/python/style-guide.md)、テスト方針は [testing.md](../.claude/rules/common/testing.md) の「Python（学習コード）のテスト方針」節を参照。
- 学習アルゴリズム（モデル構成・盤面エンコーディング・MCTS・自己対戦ループ・チェックポイント/レベル選定）の正本は [gan-cpu-self-play](../.claude/skills/gan-cpu-self-play/SKILL.md)。
- 学習済みの重み・チェックポイントファイルはリポジトリにコミットしない（[.gitignore](../.gitignore) 参照）。

## Docker実行環境

GPU（RTX 4060等、CUDA 12.8対応）で実際に学習・テストを実行する場合は、リポジトリ直下で以下を実行する。`nvidia-container-toolkit` がインストール済みであること（Dockerの `nvidia` runtime登録）が前提。

```bash
docker compose -f training/docker-compose.yml build
docker compose -f training/docker-compose.yml run --rm training pytest
```

GPU版PyTorch公式イメージ（[Dockerfile](Dockerfile)）をベースにし、リポジトリ全体を `/workspace` にマウントするため、ホスト側でコードを編集すればコンテナ再ビルドなしに反映される。依存関係（ruff・pytest以外）が増えた場合は [Dockerfile](Dockerfile) に追記し、`--build` で再ビルドする。
