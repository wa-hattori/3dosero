---
name: git-workflow
description: コミットメッセージ規約とコミット粒度の指針（言語非依存）
---

# Git ワークフロー

## ブランチ運用

- **作業に着手する前に`git fetch origin`でリモートの最新状態を確認し、`main`が`origin/main`から遅れていれば`git pull`（またはfast-forwardの`merge`）で取り込んでから作業ブランチを切る。** リモート側で他の変更（ユーザー自身の作業・GitHub上での操作等）が進んでいる可能性があるため、常に最新の`main`を起点にする。
- **`main`ブランチには直接コミットしない。** 新機能・バグ修正・ドキュメント更新など、実質的な変更に着手する前に、必ず`main`から作業ブランチを切る。
  ```
  git switch -c <type>_<short_description> main
  ```
  ブランチ名は対応するコミットの`<type>`と同じ接頭辞のsnake_case（例: `feat_ranked_score_per_board_size`、`fix_online_join_input`、`chore_bump_version_v0_3_0`）。このリポジトリの既存ブランチ（`git branch -a`）の命名もこの形式に揃っている。
- 作業ブランチ上で下記「このプロジェクトでのコミット粒度」に従ってコミットを積み、動作確認が取れたら`main`にマージする。
  ```
  git switch main
  git merge --no-ff <branch>
  ```
  マージ後にブランチを削除するかは任意（このリポジトリでは過去の作業ブランチをローカルに残す運用が多い。`git branch -a`で確認できる）。
- **マージ後、`git push origin main`まで自分（Claude Code）で行う。** ユーザーからの明示的な依頼（2026-09-06）により、「ブランチを切る→作業→マージ→リモートへのpush→（リモート側に変更があれば）ローカルへのpull」までを毎回の確認なしに一貫して行う運用に変更されている。push権限の実体は下記「この開発環境（Claude Code）からのpush権限」節のSSH Deploy Key（このリポジトリでは設定済み）。**この委譲は本リポジトリ限定であり、他のリポジトリで同様に動くとは限らない**（Deploy Keyがリポジトリ単位のため。新しいリポジトリで同じ運用にする場合は改めて同節の手順でセットアップし、ユーザーの同意を得る）。
- **例外**: [release-tagging](../../skills/release-tagging/SKILL.md)の`chore(release): bump version to X.Y.Z`コミットは、手順上`main`に直接コミットする（タグ付け直前の機械的な1行変更であり、リリース手順自体が「`main`がクリーンな状態」を前提にしているため）。それ以外の変更は必ず作業ブランチを経由する。バージョンタグのpush（`git push origin vX.Y.Z`）自体は引き続き[release-tagging](../../skills/release-tagging/SKILL.md)の手順に従う（タグpushはGitHub Pagesへの公開を伴う操作のため、リリースを行うタイミングそのものは引き続きユーザーの意思決定を要する。日常のブランチ作業のpushとは性質が異なる）。
- GitHubへの実際の`git push`は[「この開発環境（Claude Code）からのpush権限」](#この開発環境claude-codeからのpush権限)節の制約を受けるが、**ローカルでのブランチ作成・コミット・マージ自体はpush権限の有無に関係なく常に行える。** push権限が委譲されていない場合でも、ローカルでブランチを切って作業し、`main`へのマージまでは済ませておいてよい（リモートへの反映はユーザーに任せる）。
- **【実際に踏んだ不具合】** ブランチを切らずに`main`へ直接複数コミットしてしまい、かつそのうち1コミットに複数ファイル・複数の関心事（データモデル変更・アプリコード・Firestoreルール・UI・ドキュメントの計8ファイル超）を詰め込んでしまったことがある。気づいた時点で、`git switch -c`で作業ブランチを退避してから`main`を直前のコミットに`git reset --hard`で戻し、作業ブランチ側は`git reset --mixed`で一旦全ファイルをアンステージしてから関心事ごとに`git add`し直して複数コミットに分割した（pushしていなかったため、ローカルでの履歴書き換えでも安全だった）。**pushしていないローカルコミットであれば、気づいた時点でこの手順による軌道修正が可能。**

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
- **コミット前に`git diff --staged --stat`で変更ファイル数・行数を確認する習慣をつける。** 1コミットが5ファイル・10ファイルを超えて広がっている場合は要注意信号として扱い、「データモデル」「アプリコード（I/O層）」「セキュリティルール等の設定」「UI」「ドキュメント」のようにレイヤーごとに分割できないか必ず検討する（複数レイヤーにまたがる1機能の実装でも、レイヤーごとに意味の通る単位に割れることが多い。実例は[ブランチ運用](#ブランチ運用)の「実際に踏んだ不具合」参照）。
- 動作確認が取れた時点（テストが通った、手動確認で意図通り動いた）で即コミットする。作業をまとめて最後に1つの大きなコミットにしない。
- WIP（作業途中）コミットは残さない。中断する場合でも、その時点までの変更を意味のある単位に分割してコミットする。

## この開発環境（Claude Code）からのpush権限

デフォルトでは、この開発環境（Linux/WSL2のサンドボックス）にはGitHubへの書き込み認証情報が一切設定されていない（`gh auth status`は未ログイン、`git push`は`https://`リモートに対して認証エラーになる）。

**このリポジトリ（3dosero）に限っては、既にSSH Deploy Keyが設定済みで、pushの委譲が完了している。** きっかけは[ios-native-packaging](../../skills/ios-native-packaging/SKILL.md)のTestFlightパイプラインデバッグ（「小さな修正→push→CI実行→ログ確認」の反復）だったが、2026-09-06にユーザーから明示的な依頼があり、**それ以降はCIデバッグ局面に限らず、通常の開発フロー（[ブランチ運用](#ブランチ運用)参照）の一部として、ブランチのマージ後は毎回の確認なしにこの環境から`git push origin main`まで行ってよい運用に変更されている。** `origin`に既にSSH経由のリモートURL（`git@github.com-<repo>:...`）が設定されているか、`ssh -T git@github.com-<repo>`で認証成功するかを見れば、そのリポジトリで委譲済みかどうかを確認できる。

**新しいリポジトリではこの委譲は自動的には引き継がれない**（Deploy Keyはリポジトリ単位のため）。まだ委譲されていないリポジトリで同様の運用が必要になった場合は、以下の手順でこの環境専用のSSH Deploy Keyを設定し、改めてユーザーの同意を得る。

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
