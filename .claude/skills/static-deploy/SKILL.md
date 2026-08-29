---
name: static-deploy
description: ビルドツール不要の素のHTML/CSS/JS構成のアプリをHTTPSで静的公開する手順（GitHub Pages想定）とデプロイ前チェックリスト。実際に公開作業を行う時に使う。
---

# 静的サイトのHTTPS公開手順

前提: 本プロジェクトは Phase 0 時点でビルドステップなしのプレーンな HTML/CSS/JS 構成（[CLAUDE.md](../../../CLAUDE.md) 参照）。バンドラを導入した場合は本手順の「デプロイ前チェックリスト」にビルドコマンドの実行を追加すること。

## デプロイ前チェックリスト

- [ ] `index.html` をリポジトリルート（または `docs/` 等、公開元に指定するディレクトリ）に配置している
- [ ] すべてのアセット参照が相対パスまたは公開先のベースパスを考慮したパスになっている
- [ ] `console.log` / `debugger` が本番コードに残っていない（[check-console-debugger hook](../../hooks/check-console-debugger.js) で確認可能）
- [ ] 主要な操作（石を置く、視点回転、層表示切り替え）をローカルで一通り手動確認済み
- [ ] `git status` がクリーンで、公開したい変更がすべてコミット済み

## GitHub Pages での公開手順

1. GitHub上でリポジトリの Settings → Pages を開く。
2. Source を「Deploy from a branch」に設定し、公開したいブランチとディレクトリ（`/ (root)` または `/docs`）を選択する。
   - ビルドステップがない構成なら `main` ブランチのルート直下に `index.html` を置き、それをそのまま公開元に指定するのが最短。
3. 保存後、`https://<username>.github.io/<repository>/` で公開される（数分反映にかかることがある）。
4. HTTPS化は GitHub Pages が自動で提供する。独自ドメインを使う場合は `CNAME` ファイルをリポジトリルートに追加し、Pages設定でカスタムドメインを指定する。

## 代替: Vercel / Netlify（静的インポート）

ビルドステップが将来的に必要になった場合（バンドラ導入時など）は、GitHubリポジトリと連携するだけで自動デプロイできる Vercel または Netlify への移行を検討する。フレームワーク設定は「静的サイト（No framework preset）」を選ぶ。

## 公開後の確認

- 実際の公開URLにアクセスし、モバイル・デスクトップ双方でGUI操作（回転・拡大縮小・層表示）を確認する。
- 公開作業自体をコミットする必要がある場合（例: `CNAME` 追加、Pages設定用ファイル追加）は、[atomic-commit](../atomic-commit/SKILL.md) に従って `chore: configure GitHub Pages deployment` のような粒度でコミットする。
