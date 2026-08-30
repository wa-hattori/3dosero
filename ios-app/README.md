# ios-app — 3dosero の iOS ネイティブラッパー（Capacitor）

正本: [.claude/skills/ios-native-packaging/SKILL.md](../.claude/skills/ios-native-packaging/SKILL.md)。設計判断・アーキテクチャの理由はそちらを参照。このREADMEは実際の操作手順に特化する。

このディレクトリはリポジトリルートの「ビルドツールなし」方針とは独立した領域（[training/](../training/)と同じ考え方）。`npm install` や Xcode が必要になるのはこのディレクトリの中だけで、Web本体（`index.html`/`src/`）には影響しない。

## 動作確認の方法（CI-only、ローカルMac不要）

ローカルMacで最新のXcodeを用意できない場合（機材の制約、macOSのバージョンが古い等）は、**ビルド・署名・動作確認のすべてをCI（GitHub Actions macOSランナー）とTestFlightに任せる**のが主経路。ローカルでは何もインストールしなくてよい。

1. リポジトリの **Actions タブ → "Build and Release iOS App" → Run workflow** から、確認したいブランチ/タグを選んで手動起動する（[.github/workflows/ios-release.yml](../.github/workflows/ios-release.yml)、`workflow_dispatch`対応済み）。`v*`タグをpushした場合も自動的に同じワークフローが起動する。
2. `app-store-release` Environmentの承認待ちになるので、GitHub上で承認する。
3. `macos-latest`ランナー上でビルド・署名・TestFlightへのアップロードが自動実行される（10〜20分程度）。
4. iPhoneに **TestFlight** アプリをインストールし（初回のみ、App Store Connectからのテスター招待が必要。招待手順はApp Store Connectでアプリを登録した後に案内する）、新しいビルドを取得して実機で起動・動作確認する。

**この経路ではローカルMacでの`npx cap open ios`や`fastlane`実行は一切不要。** コード変更 → push → ワークフロー手動起動 → TestFlightで実機確認、のループになる。1サイクルの所要時間はローカルビルドより長い（CI実行時間＋承認＋TestFlight反映待ち）ため、複数の変更をまとめてから起動する方が効率的。

### 反復のコツ

- 些細な確認のために毎回`v*`タグを切る必要はない。`workflow_dispatch`で試したいブランチを直接指定すればよい（バージョンタグは「完成した節目」だけに使う、[release-tagging](../.claude/skills/release-tagging/SKILL.md)の方針通り）。
- `MARKETING_VERSION`は`package.json`の値をそのまま使う（トリガーがタグでもブランチ手動起動でも同じロジック）。TestFlight上のビルド番号（`BUILD_NUMBER`）はワークフロー実行ごとに`github.run_number`で自動的に増える。

## トラブルシューティングの当たりどころ

- **ワークフローが承認待ちのまま進まない**: `Settings → Environments → app-store-release` の Required reviewers に自分が登録されているか確認する。
- **署名エラー**: `fastlane/Appfile` の `app_identifier`（`com.wahattori.threedosero`）がApple Developer Portal / App Store Connect上の実際のBundle IDと一致しているか確認する。
- **`upload_to_testflight` が失敗する**: `ASC_KEY_CONTENT` はAPIキー（.p8ファイル）の中身をbase64エンコードしたものである必要がある（生のPEM文字列ではない）。
- **CIのビルドが失敗する**: 通常はCIのログで原因が分かる。Web資産の同梱漏れが疑われる場合は、`.github/workflows/ios-release.yml`の"Stage web assets"ステップのログを確認する。

## （任意）ローカルMacでも試せる場合

Mac環境が整っている場合は、ローカルでの動作確認・デバッグも可能（必須ではない）。

### 前提

- Xcode（App Store経由の最新安定版）
- Node.js、Ruby + [Bundler](https://bundler.io/)（macOS標準のRubyで動かない場合は`rbenv`/`asdf`等を検討）
- CocoaPodsは不要（Capacitor 8はSwift Package Managerを使う）

**古いMac（macOSが最新でない）の場合の制約**: インストールできるXcodeのバージョンはmacOS本体のバージョンに上限が決まっており（例: macOS Ventura 13.7系までしか入っていない場合、Xcodeは15.2までしか入らない）、かつAppleはApp Store提出に使えるXcode/SDKの最低バージョンを定期的（毎年春頃）に引き上げている。手元のmacOSが古く最新Xcodeが入らない場合、ローカルでできるのは下記「Xcodeでそのまま動作確認する」と`build_local`までで、`release`（TestFlightアップロード）は上記のCI経路に任せればよい（フォールバックではなくもともとの設計）。

### セットアップ

```bash
cd ios-app
npm install
../scripts/stage-web-assets.sh www   # index.html/src/data を www/ にコピー(Web資産のスナップショット)
npx cap sync ios                      # www/ の内容とCapacitor設定をXcodeプロジェクトに反映
npx cap open ios                      # Xcodeが開く
```

### fastlaneでのデバッグ

CI（[.github/workflows/ios-release.yml](../.github/workflows/ios-release.yml)）と**同じ`fastlane/Fastfile`**をローカルでも使える。CIではGitHub Secretsから環境変数が注入されるのに対し、ローカルでは`fastlane/.env`（dotenv、gitignore対象。`fastlane/.env.default`をコピーして作成）から読み込む。

```bash
cd ios-app
bundle install
bundle exec fastlane build_local   # 署名・アップロードなし、ビルドが通るかだけの確認(Apple資格情報不要)
bundle exec fastlane release       # CIと同じ本番相当フロー(要 fastlane/.env)
```
