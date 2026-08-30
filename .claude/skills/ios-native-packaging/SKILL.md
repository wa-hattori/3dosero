---
name: ios-native-packaging
description: Capacitorを使ったiOSネイティブアプリ化・GitHub Actions(macOSランナー)によるビルド/署名/TestFlight提出パイプラインの正本。App Store配信関連の実装・レビュー時は必ずこれを参照し、独自に再導出しない。
---

# iOSネイティブ配信の正本

CLAUDE.mdの「配信」節に言う「将来的にはApp Storeでのネイティブ配信」を実現する具体的なアーキテクチャ。Web本体（`index.html`/`src/`/`data/`）の「ビルドツールなし」方針には影響させず、`training/`と同様に**独立したサブディレクトリ・独立した依存関係**として扱う。

## スコープと前提

- ラッピング方式は [Capacitor](https://capacitorjs.com/)（Ionic製）を採用する。既存のWeb資産をそのままネイティブシェルに載せられ、Web本体側にバンドラを持ち込まずに済むため。
- 対象プラットフォームはまずiOSのみ（Androidは将来検討、このスキルの対象外）。
- **オフライン同梱方式**を採る。アプリは公開URLを都度読みに行くのではなく、リリースタグ時点のWeb資産（GANモデルのONNXファイル含む）をアプリバンドルに同梱し、ネットワークなしで対局できるようにする（Apple審査ガイドライン4.2「単なるWebサイトの薄いラッパーではない」への対応も兼ねる）。
- 実機ビルド・コード署名・TestFlight/App Store提出には**macOS + Xcodeが必須**（Appleの制約）。この開発環境（Linux/WSL2）では実行できないため、**GitHub Actionsの`macos-latest`ランナー上でビルドパイプラインをコード化**し、Claude Codeが持続的に保守・デバッグできるようにする（ユーザーの手元Macでの手動ビルドより、CI化した方がClaude側から見える化・修正しやすいという理由で選定）。public repoのためmacOSランナーも無料枠内で使える。
- アプリ名（App Store掲載名）は **「三次元オセロ」**。

## ディレクトリ構成

```
3dosero/
├── ios-app/                        # Capacitorプロジェクト。Web本体の依存関係ゼロ方針に影響させない
│   ├── package.json                 # @capacitor/core, @capacitor/cli, @capacitor/ios のみ
│   ├── capacitor.config.json
│   ├── www/                         # リリース時にWeb資産のスナップショットを配置(.gitignore対象、生成物)
│   ├── ios/                         # `npx cap add ios` が生成するXcodeプロジェクト(コミット対象)
│   └── fastlane/                    # Fastfile / Appfile(署名・ビルド・アップロードの自動化)
├── scripts/
│   └── stage-web-assets.sh          # index.html/privacy.html/src/data/package.json を任意の出力先にコピーする共通スクリプト。
│                                      # .github/workflows/deploy.yml(GitHub Pages) と ios-app/www/ への
│                                      # コピーの両方がこれを使い、公開対象ファイルの一覧が2箇所で
│                                      # 食い違わないようにする。
└── .github/workflows/
    └── ios-release.yml              # macOSランナーでのビルド・署名・TestFlight提出
```

`ios-app/`直下に独自の`package.json`を置くのは、リポジトリルートの「素のHTML/CSS/JS・ゼロ依存」方針（[CLAUDE.md](../../../CLAUDE.md)）を汚さないため。`training/`が独自の`pyproject.toml`を持つのと同じ考え方。

## バージョン同期

- iOSアプリの`CFBundleShortVersionString`（マーケティングバージョン）は、[release-tagging](../release-tagging/SKILL.md)で切る`vX.Y.Z`タグの`X.Y.Z`部分とそのまま一致させる。
- `CFBundleVersion`（ビルド番号。App Store Connect上で一意・単調増加が必須）は、GitHub Actionsの`${{ github.run_number }}`をそのまま使う（`ios-release.yml`のワークフロー単位で単調増加するため、手動管理不要）。

## `capacitor.config.json`

```json
{
  "appId": "com.wahattori.threedosero",
  "appName": "三次元オセロ",
  "webDir": "www"
}
```

`appId`（バンドルID）はApp Store Connectで一度アプリを登録すると事実上変更できないため、実際に登録する前に確定させること。暫定でこの値を使う。

## Web資産の同梱（オフライン同梱の実装）

`scripts/stage-web-assets.sh <dest-dir>` が、対局に必要な最小構成（`index.html` / `privacy.html` / `src/` / `data/` / `package.json`）を指定ディレクトリにコピーする。既存の[.github/workflows/deploy.yml](../../../.github/workflows/deploy.yml)のインライン`cp`コマンド群をこのスクリプトに切り出し、GitHub Pages公開とiOSアプリ同梱の両方から同じスクリプトを呼ぶことで、「公開対象ファイル一覧」が2箇所に分散して食い違うのを防ぐ。

`ios-release.yml`は、ビルド前に `scripts/stage-web-assets.sh ios-app/www` を実行してから `npx cap sync ios` を行う。

## CI: `.github/workflows/ios-release.yml`

- トリガーは他の2つ（`deploy.yml`/`release.yml`）と同じ `push: tags: v*` で自動起動する。ただし **`environment: app-store-release` を指定し、そのEnvironmentに「Required reviewers」保護ルールを設定**することで、実際のジョブ実行前に人間の承認を挟む（Web公開は即時反映でよいが、App Store提出はビルド番号を消費し取り消しにくいため、自動デプロイとは異なり明示的な承認を必須にする）。このEnvironment保護ルールの設定は、[static-deploy](../static-deploy/SKILL.md)で経験した`github-pages` Environmentの設定と同様、GitHub Web UI側での1回限りの手動作業になる（Settings → Environments → `app-store-release` → Required reviewers）。
- ジョブ内容（`runs-on: macos-latest`）:
  1. `actions/checkout`
  2. Node.jsセットアップ、`scripts/stage-web-assets.sh ios-app/www` でWeb資産を同梱
  3. `ios-app/`で`npm ci`、`npx cap sync ios`
  4. Rubyセットアップ、`bundle install`（`ios-app/fastlane/Gemfile`でfastlaneを管理）
  5. App Store Connect API Key（後述のSecrets）を使い、`bundle exec fastlane release`でビルド・自動署名・TestFlightアップロードまで実行

## 署名: App Store Connect APIキー方式

証明書・プロビジョニングプロファイルを別リポジトリで管理する`fastlane match`は個人開発には過剰なため、**App Store Connect APIキー + Xcodeの自動署名（`xcodebuild -allowProvisioningUpdates`相当）**を使う。APIキーはApp Store Connect側で生成する非対話的な認証情報で、Apple IDのパスワード・2要素認証をCIに持ち込まずに済む。

必要なGitHub Secrets（すべてリポジトリのSettings → Secrets and variables → Actionsで設定。値の生成手順はApple Developer Program登録後に別途案内する）:

| Secret名 | 内容 |
|---|---|
| `ASC_KEY_ID` | App Store Connect APIキーのKey ID |
| `ASC_ISSUER_ID` | App Store Connect APIキーのIssuer ID |
| `ASC_KEY_CONTENT` | APIキー(.p8)ファイルの内容をbase64エンコードしたもの |
| `ASC_TEAM_ID` | Apple DeveloperのTeam ID |

## `ios-app/fastlane/Fastfile`（概要）

```ruby
default_platform(:ios)

platform :ios do
  desc "Build and upload a release build to TestFlight"
  lane :release do
    api_key = app_store_connect_api_key(
      key_id: ENV["ASC_KEY_ID"],
      issuer_id: ENV["ASC_ISSUER_ID"],
      key_content: ENV["ASC_KEY_CONTENT"],
      is_key_content_base64: true,
    )

    increment_version_number(version_number: ENV["MARKETING_VERSION"])
    increment_build_number(build_number: ENV["BUILD_NUMBER"])

    build_app(scheme: "App", export_method: "app-store")

    upload_to_testflight(
      api_key: api_key,
      skip_waiting_for_build_processing: true,
    )
  end
end
```

初回のTestFlight配信までを自動化のゴールとする。App Store本審査への提出（審査ノート記入・スクリーンショット・審査対象ビルド選択）はApp Store Connect上での人手作業として残る（現状Fastlaneの`deliver`アクションで自動化する範囲外とする。将来的に自動化する場合は別途このスキルを更新する）。

## アイコン・プライバシーポリシー

- アプリアイコン: Xcode 14以降のアセットカタログは1024×1024（アルファチャンネルなし）のPNG1枚だけで全サイズを自動生成するため、複数サイズを個別に用意する必要はない。`ios-app/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`を差し替えるだけでよい。
  - デザインは「積み重なった正方形の盤面」というコンセプトを表す、3層のフラットなアイソメトリック板＋石2個（黒・白）。ソース（SVG）は`ios-app/icon-source.svg`、生成スクリプトは`ios-app/scripts/generate-icon.py`（ImageMagick/`convert`が必要。デザインを調整したら再実行して差し替える）。
  - App Store提出用アイコンはアルファチャンネルを持てない（Appleが拒否する）ため、生成スクリプトは`-alpha remove -alpha off`で必ず不透明化する。
- プライバシーポリシー: GitHub Pagesに簡単な1ページ（`privacy.html`、リポジトリルート直下、`deploy.yml`のステージ対象に追加）を用意し、そのURLをApp Store Connectのプライバシーポリシー欄に登録する。内容は「個人情報を収集しない」旨を明記する程度の最小限のものとする（本アプリはサーバー通信を行わないため）。

## Apple Developer Program登録

このスキルの対象外。取得手順はユーザーからの依頼があった時点で別途案内する。

## エッジケース・注意点

1. **`ios-app/ios/`はコミット対象**（Xcodeプロジェクトファイル一式）だが、`ios-app/www/`（Web資産のコピー）と`ios-app/node_modules/`は`.gitignore`で除外する生成物。
2. **`appId`は登録後に事実上変更不可**。App Store Connectで最初にアプリを作成する前に、この文書とCLAUDE.mdの値が最終確定していることを確認する。
3. **ビルド番号(`CFBundleVersion`)は同一アプリ内で後戻りできない**。`github.run_number`を使うことで、ワークフローを再実行しない限り自然に単調増加する前提を壊さないよう注意する。
4. **初回のCI実行は高確率でデバッグが必要**。実際のmacOSランナー・Apple資格情報を使った初回実行までは、この文書の内容は未検証の設計である旨を認識しておく。
