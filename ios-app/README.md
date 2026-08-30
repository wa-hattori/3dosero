# ios-app — 3dosero の iOS ネイティブラッパー（Capacitor）

正本: [.claude/skills/ios-native-packaging/SKILL.md](../.claude/skills/ios-native-packaging/SKILL.md)。設計判断・アーキテクチャの理由はそちらを参照。このREADMEは実際の操作手順（特にMacでのローカルデバッグ）に特化する。

このディレクトリはリポジトリルートの「ビルドツールなし」方針とは独立した領域（[training/](../training/)と同じ考え方）。`npm install` や Xcode が必要になるのはこのディレクトリの中だけで、Web本体（`index.html`/`src/`）には影響しない。

## 前提（Macに必要なもの）

- Xcode（App Store経由の最新安定版）
- Node.js（`npm install` に使用。バージョンはリポジトリルートと同じでよい）
- Ruby + [Bundler](https://bundler.io/)（fastlane用。macOS標準のRubyで動くはずだが、動かない場合は `rbenv`/`asdf` 等でのRuby導入を検討）

CocoaPodsは不要（Capacitor 8はSwift Package Managerを使うため）。

### 注意: 古いMac（macOSが最新でない）の場合

インストールできるXcodeのバージョンはmacOS本体のバージョンに上限が決まっており（例: macOS Ventura 13.7系までしか入っていない場合、Xcodeは15.2までしか入らない）、かつAppleはApp Store提出に使えるXcode/SDKの最低バージョンを定期的（毎年春頃）に引き上げている（詳細は[ios-native-packaging SKILL.mdの該当節](../.claude/skills/ios-native-packaging/SKILL.md#古いmacでのローカルデバッグの限界)）。手元のmacOSが古く最新Xcodeが入らない場合、**このMacでできるのは下記「Xcodeでそのまま動作確認する」と「`build_local`」までで、`release`（TestFlightアップロード）まで到達させる必要はない。** それはCI（`macos-latest`ランナー、常に最新Xcodeを使用）側の役割であり、フォールバックではなくもともとの設計。

## 初回セットアップ

```bash
cd ios-app
npm install
../scripts/stage-web-assets.sh www   # index.html/src/data を www/ にコピー(Web資産のスナップショット)
npx cap sync ios                      # www/ の内容とCapacitor設定をXcodeプロジェクトに反映
npx cap open ios                      # Xcodeが開く
```

Web本体（`../src/`等）を変更した後は、`stage-web-assets.sh` と `cap sync ios` をやり直せば最新化される。Xcode上で毎回手動コピーする必要はない。

## Xcodeでそのまま動作確認する

`npx cap open ios` で開いたXcodeで、通常のiOSアプリと同じようにシミュレータ/実機でRunできる。**このステップに署名やApple Developer Programの資格情報は不要**（開発用の自動署名でシミュレータ実行は可能）。まずここでアプリが起動し、盤面が表示されることを確認するのが最初の動作確認ポイント。

## fastlaneでのデバッグ

CI（[.github/workflows/ios-release.yml](../.github/workflows/ios-release.yml)）と**同じ`fastlane/Fastfile`**をローカルでも使う。CIではGitHub Secretsから環境変数が注入されるのに対し、ローカルでは`fastlane/.env`（dotenv、gitignore対象）から読み込む。ロジックが1本化されているため、「CIでは失敗するがローカルでは再現しない」という食い違いが起きにくい。

```bash
cd ios-app
bundle install
```

### 1. まず `build_local`（Apple Developer Program不要）

署名・アップロードなしで、Xcodeプロジェクトが実際にビルドできることだけを確認する最速のデバッグ手順。Capacitor側の設定ミスやWeb資産の同梱漏れなど、Apple側の資格情報とは無関係な問題はここで大半が判明する。

```bash
bundle exec fastlane build_local
```

### 2. 次に `release`（要 App Store Connect API Key）

TestFlightへの実際のアップロードまで含む、CIと完全に同じフロー。

```bash
cp fastlane/.env.default fastlane/.env
# fastlane/.env を編集し、ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_CONTENT / ASC_TEAM_ID を埋める
# (各値の取得手順はApple Developer Program登録後に別途案内する)
bundle exec fastlane release
```

`.env`は`.gitignore`対象なのでコミットされない。GitHub Secretsに設定する値とまったく同じものをここに書けば、CIで起きる問題をローカルで再現・デバッグできる。

## CIとの対応関係

| | ローカル（Mac） | CI（`ios-release.yml`） |
|---|---|---|
| トリガー | 手動でコマンド実行 | `v*` タグpush（+ Environment承認ゲート） |
| Web資産の取得 | `../scripts/stage-web-assets.sh www` を自分で実行 | 同じスクリプトをワークフロー内で自動実行 |
| 環境変数 | `fastlane/.env`（dotenv） | GitHub Secrets（`ASC_KEY_ID`等） |
| 実行環境 | 自分のMac | `macos-latest` ランナー |
| 呼ぶlane | `build_local` → `release` の順に試す | `release` のみ |

CIが失敗した場合は、まずログを見て `build_local` 相当の問題（ビルド自体が通らない）か `release` 相当の問題（署名・アップロード）かを切り分け、対応するlaneをローカルで再現するのがデバッグの基本方針。

## トラブルシューティングの当たりどころ

- **`cap sync ios` 後にビルドが壊れる**: `www/` の内容が古い可能性が高い。`stage-web-assets.sh` からやり直す。
- **署名エラー**: `fastlane/Appfile` の `app_identifier`（`com.wahattori.threedosero`）がApple Developer Portal / App Store Connect上の実際のBundle IDと一致しているか確認する。
- **`upload_to_testflight` が失敗する**: `ASC_KEY_CONTENT` はAPIキー（.p8ファイル）の中身をbase64エンコードしたものである必要がある（生のPEM文字列ではない）。`base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy` で取得できる。
