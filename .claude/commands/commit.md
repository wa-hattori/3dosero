---
description: 現在の変更をレビューし、Angular規約に従ったアトミックなコミットを作成する
---

現在の作業ツリーの変更（`git status` / `git diff` / `git diff --staged`）を確認し、[.claude/skills/atomic-commit/SKILL.md](../skills/atomic-commit/SKILL.md) の手順に従って、意味のある単位ごとに分割し、[.claude/rules/common/git-workflow.md](../rules/common/git-workflow.md) のAngular形式（`<type>(<scope>): <subject>`）でコミットメッセージを作成してコミットせよ。

- 無関係な変更を1コミットに混ぜない。必要なら `git add -p` で部分ステージする。
- 各コミット前に、デバッグ用の `console.log`/`debugger` が混入していないか確認する。
- すべての変更をコミットし終えたら `git log --oneline` の該当範囲を提示して完了を報告する。
- 判断に迷うグルーピングがあれば、コミットする前にユーザーに確認する。

このコマンドの実行は `commit-crafter` エージェント（[.claude/agents/commit-crafter.md](../agents/commit-crafter.md)）に委任してもよい。
