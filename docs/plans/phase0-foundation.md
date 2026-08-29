# Phase 0: 自律的開発の土台構築 — 計画記録

> このファイルは、Phase 0（ゲーム実装に着手する前の CLAUDE.md / agents / skills / rules / commands / hooks 整備）で
> 実際に承認・実行された計画をそのまま記録したものです。参考: [affaan-m/ECC](https://github.com/affaan-m/ECC/blob/main/docs/ja-JP/README.md)

## Context

`3dosero` は 8×8×8 の立体オセロを素の HTML/CSS/JS（将来 Three.js 導入予定）で作り、HTTPS で公開し、将来的には App Store 展開と GAN ベースの CPU 対戦相手を目指すプロジェクト。実際のゲームコードに着手する前に、ECC の日本語READMEが示す構成（CLAUDE.md / agents / skills / rules / commands / hooks）を参考に、Claude Code が自律的に開発を進められる土台をこのリポジトリに作ることを目的とする。加えて、(1) 一般的なJSコーディング規約をCLAUDE.mdに明記すること、(2) 開発ステップごとに、Angular commit message 規約（`type(scope): subject`、type は feat/fix/docs/style/refactor/perf/test/chore）に従った細かいコミットを積むこと、を満たす。

ECCの原本は14 agents/28 skills/30 commandsという大規模フレームワークだが、これは本プロジェクトの実態（ソロ開発・ゲーム開始前）に対して過剰と判断し、目的（立体オセロのルール実装、Three.js描画、テスト、コミット規律、公開）に直結する小さく実用的なセットに絞って移植した。

## 成果物構成

```
3dosero/
├── README.md
├── .gitignore
├── CLAUDE.md
├── docs/plans/phase0-foundation.md   # 本ファイル
└── .claude/
    ├── settings.json                 # hooks登録
    ├── rules/
    │   ├── common/{git-workflow,testing}.md
    │   └── javascript/{style-guide,three-js-conventions}.md
    ├── skills/
    │   ├── atomic-commit.md
    │   ├── tdd-loop.md
    │   ├── othello-3d-flip-rule.md
    │   └── static-deploy.md
    ├── agents/
    │   ├── game-logic-reviewer.md
    │   ├── three-renderer-specialist.md
    │   └── commit-crafter.md
    ├── commands/{commit,plan-step}.md
    └── hooks/{check-commit-message,check-console-debugger}.js
```

## コミット計画

1. `docs: add project overview to README`
2. `docs: record phase 0 foundation plan`
3. `chore: add .gitignore`
4. `docs: add CLAUDE.md with project brief and JS coding conventions`
5. `chore: add common development rules for git workflow and testing`
6. `chore: add javascript and three.js rule references`
7. `chore: add development workflow skills`
8. `chore: add specialized subagents for game logic, rendering, and commits`
9. `chore: add commit and plan-step slash commands`
10. `chore: add commit-message lint and console/debugger warning hooks`

## スコープ外（今回やらないこと）

盤面状態・反転ロジックの実装、Three.js導入、GUI実装、実際のGitHub Pages等へのデプロイ実行、GAN CPU対戦相手。これらは土台構築完了後の次フェーズ。
