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

## この開発環境（Claude Code）からのpush権限

デフォルトでは、この開発環境（Linux/WSL2のサンドボックス）にはGitHubへの書き込み認証情報が一切設定されていない（`gh auth status`は未ログイン、`git push`は`https://`リモートに対して認証エラーになる）。通常の開発ではユーザー自身がpush/マージを行うため問題にならないが、**CIワークフローのデバッグのように「小さな修正→push→CI実行→ログ確認」を何十回も繰り返す局面**では、毎回ユーザーに仲介してもらうのがボトルネックになる（実例: [ios-native-packaging](../../skills/ios-native-packaging/SKILL.md)のTestFlightパイプラインデバッグで、10回以上のCI実行サイクルを要した）。

そのような局面でユーザーから明示的にpush権限の委譲を依頼された場合、以下の手順でこの環境専用のSSH Deploy Keyを設定する。

1. **この環境専用の新しいSSH鍵ペアを生成する**（`~/.ssh/id_ed25519`など、既存の鍵を流用しない）。ユーザーの個人アカウント鍵など、既に別の場所で使われている鍵をそのまま登録しようとすると、GitHub側で「Key is already in use」エラーになる。
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_<repo>_ci -N "" -C "claude-code-<repo>-ci"
   ```
2. **`~/.ssh/config`にこのリポジトリ専用のHostエイリアスを追加する**（`github.com`自体を上書きしない。ユーザーが同じ環境で自分のGitHub個人鍵も使っている可能性があるため）。
   ```
   Host github.com-<repo>
     HostName github.com
     User git
     IdentityFile ~/.ssh/id_ed25519_<repo>_ci
     IdentitiesOnly yes
   ```
3. **公開鍵をユーザーに渡し、対象リポジトリの Settings → Deploy keys で「Allow write access」付きで登録してもらう。** 公開鍵は機密情報ではないためチャットにそのまま貼ってよい。秘密鍵はこの環境の外に一切出さない。
4. `git remote set-url origin git@github.com-<repo>:<owner>/<repo>.git` でリモートをSSH経由に切り替える。
5. Deploy Keyはリポジトリ単位のアクセスに限定され、不要になればGitHub側でいつでも即時無効化できる。PAT（Personal Access Token）よりスコープが狭く安全なため、この用途ではPATより優先する。

### この方式でできないこと

SSH Deploy Keyは**gitのpush/pull（Git Smart HTTP/SSHプロトコル）のみ**を認証する。GitHub Actionsのワークフロー起動（`workflow_dispatch`）やPull Requestの作成・マージなど、**GitHub REST/GraphQL API経由の操作には別途`gh auth login`相当のトークンが必要**であり、SSH鍵だけでは代替できない。そのため:

- ブランチのマージは、GitHub上のPRを介さず**ローカルで`git merge`してから`main`に直接push**する形になる（`gh pr create`/`gh pr merge`は使えない）。マージコミットは「Merge pull request #N from ...」ではなく「Merge branch '...' into main」という表記になるが、動作上の違いはない。
- Environmentに「Required reviewers」保護ルールを設定している場合（[ios-native-packaging](../../skills/ios-native-packaging/SKILL.md)の`app-store-release`など）、ワークフロー実行前の承認は引き続きユーザーがGitHub UI上で行う必要がある。これは意図的な安全装置であり、APIトークンを追加したとしても回避すべきではない。

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

### リリースノート

**すべてのバージョンタグに、GitHubのRelease機能でリリースノートを必ず付与する。** 手動での付け忘れを防ぐため、タグpush時に [.github/workflows/release.yml](../../../.github/workflows/release.yml) が自動でGitHub Releaseを作成する（人手の手順に依存しない）。具体的な手順・自動生成されたノートの調整方法は [release-tagging](../../skills/release-tagging/SKILL.md) を参照。
