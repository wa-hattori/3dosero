---
description: 次の開発タスクについて、関連するrules/skillsを踏まえた短い実装ステップ案を提示する
argument-hint: [次に取り組みたいタスクの説明]
---

これから着手するタスク: $ARGUMENTS

以下を行い、コードは書かずに短い実装ステップ案を提示せよ:

1. [CLAUDE.md](../../CLAUDE.md) を確認し、プロジェクト概要・現時点のアーキテクチャ方針・コーディング規約との整合性を確認する。
2. タスクの性質に応じて、関連する rules / skills を特定し目を通す（例: ゲームロジックなら [othello-3d-flip-rule](../skills/othello-3d-flip-rule/SKILL.md) と [tdd-loop](../skills/tdd-loop/SKILL.md)、描画/UIなら [three-js-conventions](../rules/javascript/three-js-conventions.md)、デプロイなら [static-deploy](../skills/static-deploy/SKILL.md)）。
3. タスクを、[.claude/rules/common/git-workflow.md](../rules/common/git-workflow.md) の粒度指針に沿って「1コミットになる単位」に分解したステップ一覧として提示する。各ステップには想定するコミットの `type` を添える。
4. 未確定な設計判断（データ構造の選択、UIの挙動など）があれば、実装前にユーザーに確認すべき点として明示する。
5. ステップ案の提示のみを行い、ユーザーの承認を得てから実装に進む。
