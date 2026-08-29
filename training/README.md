# training/

GANベースCPU対戦相手（[CLAUDE.md](../CLAUDE.md) の「将来構想」参照）の学習コード一式。

- ブラウザ側の `src/` とは独立した領域。`three` やDOM APIは一切登場しない。
- コーディング規約は [python/style-guide.md](../.claude/rules/python/style-guide.md)、テスト方針は [testing.md](../.claude/rules/common/testing.md) の「Python（学習コード）のテスト方針」節を参照。
- 学習アルゴリズム（モデル構成・盤面エンコーディング・報酬設計・自己対戦ループ・チェックポイント方針）の正本は、設計確定後に `.claude/skills/` 配下へドキュメント化する（未作成）。
- 学習済みの重み・チェックポイントファイルはリポジトリにコミットしない（[.gitignore](../.gitignore) 参照）。
