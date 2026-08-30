---
name: release-tagging
description: 「完成した」節目でバージョンタグを切り、GitHub Pagesの公開URLに反映させるまでの手順。実際にリリースを行う時に使う。
---

# バージョンタグを切って公開する手順

正本: [git-workflow.mdのバージョンタグ運用](../../rules/common/git-workflow.md#バージョンタグ運用)（何を・いつタグにするか）、[static-deploy](../static-deploy/SKILL.md)（タグpushで何が起きるか）。このスキルは両者をつなぐ実行手順。

## 前提（初回のみ）

リポジトリの Settings → Pages → Source が **「GitHub Actions」** になっていること（[static-deploy](../static-deploy/SKILL.md) 参照）。「Deploy from a branch」のままだとタグをpushしても公開URLは更新されない。

## 手順

1. **mainブランチが最新かつクリーンであることを確認する。**
   ```
   git switch main && git pull && git status
   ```
   リリース対象の変更がすべてmainにマージ・コミット済みであること。

2. **テストを実行する。**
   ```
   npm test
   ```
   `training/` 配下に変更がある場合は、GAN CPUモデルの再エクスポートが必要かどうかも合わせて確認する（モデル自体はコミット済みの `data/models/**/*.onnx` がそのまま公開されるため、モデルを更新した場合のみ再エクスポート・コミットが必要）。

3. **バージョン番号を決める。**
   [git-workflow.mdのフォーマット節](../../rules/common/git-workflow.md#バージョン番号のフォーマット)に従い、`X.Y.Z` のどこを上げるか（機能追加ならY、バグ修正のみならZ）を決める。

4. **`package.json` の `version` を更新し、コミットする。**
   ```
   chore(release): bump version to X.Y.Z
   ```

5. **注釈付きタグを作成する。**
   ```
   git tag -a vX.Y.Z -m "vX.Y.Z"
   ```
   タグ名は `v` プレフィックス必須（`.github/workflows/deploy.yml` のトリガー条件 `v*` と一致させるため）。

6. **mainとタグをpushする。**
   ```
   git push origin main
   git push origin vX.Y.Z
   ```
   タグのpushをトリガーに [.github/workflows/deploy.yml](../../../.github/workflows/deploy.yml) が起動する。

7. **GitHub ActionsでワークフローがSuccessしたことを確認する。**
   リポジトリの Actions タブから確認する（`gh run list` / `gh run watch` でも可）。

8. **公開後の確認を行う。**
   [static-deploy「公開後の確認」](../static-deploy/SKILL.md#公開後の確認)に従い、実際の公開URLで画面右下のバージョンバッジが `vX.Y.Z` と一致していること、主要な操作が問題なく動くことを確認する。

## 失敗した場合

- ワークフローが失敗した場合、公開URLは**直前に成功したタグの内容のまま**（デプロイは差し替え式で、失敗時に壊れた状態が公開されることはない）。原因を修正し、同じタグを再pushするのではなく、修正を加えた新しいパッチバージョンで再度この手順をやり直す。
- 一度pushしたタグは公開履歴になるため、`git tag -d` からの `--force` push で書き換えない。誤ったタグを切った場合も、削除・付け替えではなく次のパッチバージョンで訂正する。
