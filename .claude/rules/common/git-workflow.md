---
name: git-workflow
description: コミットメッセージ規約とコミット粒度の指針（言語非依存）
---

# Git ワークフロー

## コミットメッセージ規約（Angular commit message guidelines 準拠）

出典: [Angular DEVELOPERS.md](https://github.com/angular/angular.js/blob/master/DEVELOPERS.md#commits)

### フォーマット

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

- ヘッダー（1行目）は必須。`<scope>` は省略可能。
- ヘッダーを含む各行は100文字以内に収める。
- body・footer は必要な場合のみ記述する。

### type 一覧

| type | 意味 |
|---|---|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `style` | コードの意味に影響しない変更（空白、フォーマット、セミコロン欠落など） |
| `refactor` | バグ修正でも機能追加でもないコード変更 |
| `perf` | パフォーマンスを改善するコード変更 |
| `test` | テストの追加または修正 |
| `chore` | ビルドプロセスや補助ツール・ライブラリ、設定ファイルの変更 |

### subject の規則

- 命令形・現在時制を使う（`add`。`added` や `adds` ではない）。
- 先頭の文字を大文字にしない。
- 末尾にピリオド（`.`）を付けない。
- 何を・なぜ変更したかが一目でわかる簡潔な文にする。

### body / footer

- body も命令形・現在時制で書き、変更の動機・従来動作との違いを説明する。
- footer には Breaking Changes や関連 issue 番号を記載する（このプロジェクトでは当面 issue 運用なしのため省略可）。

### 例

良い例:

```
feat(board): add 26-direction flip detection for stone placement

fix(camera): clamp zoom level to avoid clipping through the board

docs: add JSDoc to move-validation module
```

悪い例（typeなし・命令形でない・末尾ピリオド）:

```
Added flip logic.
```

## このプロジェクトでのコミット粒度

- **1つの動く変更単位 = 1コミット。** 「盤面初期化」「1方向の反転判定」「UIの1操作」のように、意味のある最小単位ごとにコミットする。
- 複数の関心事（例: ロジック修正 + スタイル変更 + ドキュメント更新）を1コミットにまとめない。まとめて変更してしまった場合は `git add -p` で部分ステージして分割する。手順は [atomic-commit](../../skills/atomic-commit/SKILL.md) を参照。
- 動作確認が取れた時点（テストが通った、手動確認で意図通り動いた）で即コミットする。作業をまとめて最後に1つの大きなコミットにしない。
- WIP（作業途中）コミットは残さない。中断する場合でも、その時点までの変更を意味のある単位に分割してコミットする。

## バージョンタグ運用

コミット単位のAngular規約とは別に、「完成した」節目に対してのみGitHubタグでバージョンを付与する。**毎コミットでタグを切るわけではない。**

### バージョン番号のフォーマット

[セマンティックバージョニング](https://semver.org/lang/ja/) `vX.Y.Z` に従う（`v`プレフィックス必須。例: `v0.1.0`）。

- `X`（メジャー）: 後方互換性のない変更（盤面データ構造、GAN CPUのモデル形式などの破壊的変更）。
- `Y`（マイナー）: 後方互換性を保った機能追加（新しいCPUレベル・新盤面サイズの追加など）。
- `Z`（パッチ）: 後方互換性を保ったバグ修正のみ。
- メジャーバージョン0（`0.x.y`）の間は互換性の保証が緩い扱いとする（[Semantic Versioningの仕様](https://semver.org/lang/ja/#spec-item-4)通り）。

### `package.json` のversionとの同期

`package.json` の `"version"` フィールドは常に直近のタグと一致させる。タグを切る具体的な手順は [release-tagging](../../skills/release-tagging/SKILL.md) を参照。

### タグを切るタイミング

- mainブランチにマージ済みで動作確認が取れた節目でのみタグを切る。フィーチャーブランチや作業中のコミットには付けない。
- 「主要機能が一通り動く」「大きな不具合を修正した」「新しい盤面サイズ・CPUレベルに対応した」など、ユーザーから見て意味のある区切りを目安にする。

### HTTPS公開との関係

公開URL（GitHub Pages）は **タグをpushした時のみ** 自動デプロイされる（[static-deploy](../../skills/static-deploy/SKILL.md) 参照）。mainブランチへの通常のpushだけでは公開サイトの内容は変わらない。
