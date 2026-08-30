---
name: static-deploy
description: ビルドツール不要の素のHTML/CSS/JS構成のアプリをHTTPSで静的公開する手順（GitHub Pages想定）とデプロイ前チェックリスト。実際に公開作業を行う時に使う。
---

# 静的サイトのHTTPS公開手順

前提: 本プロジェクトはビルドステップなしのプレーンな HTML/CSS/JS 構成（[CLAUDE.md](../../../CLAUDE.md) 参照）。バンドラを導入した場合は本手順の「デプロイ前チェックリスト」にビルドコマンドの実行を追加すること。

**公開URL（GitHub Pages）は `v*` 形式のGitタグをpushした時のみ自動デプロイされる。** mainブランチへの通常のpushだけでは公開サイトの内容は変わらない（[git-workflow.mdのバージョンタグ運用](../../rules/common/git-workflow.md#バージョンタグ運用)）。実際にタグを切って公開する手順は [release-tagging](../release-tagging/SKILL.md) を参照。このスキルは「公開の仕組み（何が・どうやって配信されるか）」を扱う。

## デプロイ前チェックリスト（タグを切る前に確認する）

- [ ] すべてのアセット参照が相対パスまたは公開先のベースパスを考慮したパスになっている
- [ ] `console.log` / `debugger` が本番コードに残っていない（[check-console-debugger hook](../../hooks/check-console-debugger.js) で確認可能）
- [ ] 主要な操作（石を置く、視点回転、層表示切り替え）をローカルで一通り手動確認済み
- [ ] `git status` がクリーンで、公開したい変更がすべてmainにマージ・コミット済み

## GitHub Pages での公開の仕組み

1. （初回のみ・手動）GitHub上でリポジトリの Settings → Pages を開き、Source を **「GitHub Actions」** に設定する（「Deploy from a branch」ではない）。
2. `v*` にマッチするタグ（例: `v0.1.0`）をpushすると、[.github/workflows/deploy.yml](../../../.github/workflows/deploy.yml) が起動し、公開に必要な最小限のファイル（`index.html` / `privacy.html` / `src/` / `data/` / `package.json`。`training/` や `.claude/` などゲーム本体に不要なものは含めない）だけを集めてPagesにデプロイする。
3. 数分後、`https://<username>.github.io/<repository>/` にタグ時点の内容が反映される。
4. HTTPS化は GitHub Pages が自動で提供する。独自ドメインを使う場合は `CNAME` ファイルをリポジトリルートに追加し、Pages設定でカスタムドメインを指定する（この場合もワークフローのデプロイ対象ファイル一覧に追加が必要）。

## 代替: Vercel / Netlify（静的インポート）

ビルドステップが将来的に必要になった場合（バンドラ導入時など）は、GitHubリポジトリと連携するだけで自動デプロイできる Vercel または Netlify への移行を検討する。フレームワーク設定は「静的サイト（No framework preset）」を選ぶ。その場合もタグpushをトリガーにする設定に変更すること。

## 公開後の確認

- 実際の公開URLにアクセスし、モバイル・デスクトップ双方でGUI操作（回転・拡大縮小・層表示）を確認する。
- 画面内のバージョン表示（package.jsonの`version`を読んで表示するバッジ）が、切ったタグのバージョンと一致していることを確認する。
- ワークフロー自体の変更（`.github/workflows/deploy.yml` の追加・修正）は、[atomic-commit](../atomic-commit/SKILL.md) に従って `chore: ...` の粒度でコミットする。
