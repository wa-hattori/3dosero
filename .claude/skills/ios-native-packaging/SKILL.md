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

- トリガーは他の2つ（`deploy.yml`/`release.yml`）と同じ `push: tags: v*` に加え、**`workflow_dispatch`（GitHub UIの「Run workflow」ボタン、任意のブランチ/タグを選べる）でも手動起動できる。** ローカルMacでのXcodeデバッグを前提にできない場合（後述「ローカルMacが使えない場合の開発フロー」）、動作確認のたびにバージョンタグを切るのは重すぎるため、確認したいブランチを直接指定して手動起動するのが日常的な使い方になる。バージョンタグは引き続き「完成した節目」だけに使う（[release-tagging](../release-tagging/SKILL.md)の方針通り）。
- どちらのトリガーでも **`environment: app-store-release` を指定し、そのEnvironmentに「Required reviewers」保護ルールを設定**することで、実際のジョブ実行前に人間の承認を挟む（Web公開は即時反映でよいが、App Store提出はビルド番号を消費し取り消しにくいため、自動デプロイとは異なり明示的な承認を必須にする）。このEnvironment保護ルールの設定は、[static-deploy](../static-deploy/SKILL.md)で経験した`github-pages` Environmentの設定と同様、GitHub Web UI側での1回限りの手動作業になる（Settings → Environments → `app-store-release` → Required reviewers）。
- ジョブ内容（`runs-on: macos-latest`）:
  1. `actions/checkout`
  2. Node.jsセットアップ
  3. バージョン決定: `MARKETING_VERSION`は`package.json`の値をそのまま使う（タグpush・workflow_dispatchのどちらでも同じロジックで求まる）。`BUILD_NUMBER`は`github.run_number`
  4. `scripts/stage-web-assets.sh ios-app/www` でWeb資産を同梱
  5. `ios-app/`で`npm ci`、`npx cap sync ios`
  6. Rubyセットアップ、`bundle install`（`ios-app/Gemfile`でfastlaneを管理）
  7. App Store Connect API Key（後述のSecrets）を使い、`bundle exec fastlane release`でビルド・自動署名・TestFlightアップロードまで実行

## ローカルMacが使えない場合の開発フロー

ローカルMacで最新のXcodeを用意できない場合（機材の制約、macOSのバージョンが古い等。下記「古いMacでのローカルデバッグの限界」参照）は、**ビルド・署名・動作確認のすべてをCIとTestFlightに任せる**のを主経路とする（[ios-app/README.md](../../../ios-app/README.md)に具体的な手順）。

コード変更 → push → Actions画面から`ios-release.yml`を`workflow_dispatch`で手動起動 → `app-store-release`の承認 → CIがビルド・署名・TestFlightアップロード → iPhoneのTestFlightアプリで実機確認、というループになる。ローカルの`npx cap open ios`や`fastlane`実行は一切不要。1サイクルの所要時間はローカルビルドより長い（CI実行時間＋承認＋TestFlight反映待ち）ため、複数の変更をまとめてから起動する方が効率的。

## 署名: App Store Connect APIキー方式

証明書・プロビジョニングプロファイルを別リポジトリで管理する`fastlane match`は個人開発には過剰なため、**App Store Connect APIキー + Xcodeの自動署名（`xcodebuild -allowProvisioningUpdates`相当）**を使う。APIキーはApp Store Connect側で生成する非対話的な認証情報で、Apple IDのパスワード・2要素認証をCIに持ち込まずに済む。

必要なGitHub Secrets（すべてリポジトリのSettings → Secrets and variables → Actionsで設定。値の生成手順は[Apple Developer Program登録から初回TestFlightアップロードまでのチェックリスト](#apple-developer-program登録から初回testflightアップロードまでのチェックリスト)参照）:

| Secret名 | 内容 |
|---|---|
| `ASC_KEY_ID` | App Store Connect APIキーのKey ID |
| `ASC_ISSUER_ID` | App Store Connect APIキーのIssuer ID |
| `ASC_KEY_CONTENT` | APIキー(.p8)ファイルの内容をbase64エンコードしたもの |
| `ASC_TEAM_ID` | Apple DeveloperのTeam ID |

### 実際の値（記録）

- **Team ID**: `R2KLHG25KN`。Team IDは Apple Developer **アカウント**に紐づく識別子で、今後別のアプリを作る場合も共通（Bundle IDとは異なりアプリ単位ではない）。単体では認証・操作の権限を持たない識別子であり（実際の権限はAPIキーやApple ID＋2要素認証が担う）、Universal Links用の`apple-app-site-association`のように本来公開情報として扱われる場面もあるため、この正本に直接記録する（CIへの受け渡しは引き続き`ASC_TEAM_ID`のGitHub Secret経由で行い、値そのものの秘匿目的ではなく設定の一元管理のため）。
- **Bundle ID**: `com.wahattori.threedosero`で最終確定。**Bundle IDはアプリ単位の識別子**（Team IDと異なり、アプリごとに一意でなければならない）。今後別のアプリを作る場合は`com.wahattori.<アプリ名>`のように新規のBundle IDを別途登録する。

### App ID登録時のCapabilities

現時点（v1）ではどれもチェック不要。検討した上で不要と判断した項目、および将来必要になりうる項目を記録する。**Capabilityは（Bundle IDと違い）登録後でも追加できる**ため、今チェックしなくても取り返しがつかないわけではない。

- **Push通知**: 不要。オンライン対戦はFirestoreのリアルタイム購読で動作しており、APNs（Apple Push Notification service）を経由しない。「自分の手番になったらアプリを閉じていても通知する」を将来作る場合は必要になる（[online-multiplayer](../online-multiplayer/SKILL.md)ではv1スコープ外とした機能）。
- **Game Center**: 使わない。Apple独自のマッチメイキング機構（GameKit）はWeb版から呼べないため不採用（[online-multiplayer](../online-multiplayer/SKILL.md)でFirebaseを選定した理由そのもの）。
- **Associated Domains**（Universal Links）: 不要。「リンクを踏むと直接そのルームに参加できる」機能を作るなら必要になる。現状のルームコード共有は手入力前提。実現すればUXが上がる将来の拡張候補。
- **Sign in with Apple**: 該当しない。Appleの審査ガイドライン4.8は「外部ログイン機能を提供する場合はSign in with Appleも用意すること」という規定だが、本アプリはFirebase匿名認証のみ（ログイン画面自体が存在しない）でこの規定の対象外。
- **In-App Purchase**: 不要。無料アプリのため対象外。

## `ios-app/fastlane/Fastfile`（概要）

```ruby
require "base64"
require "tempfile"

default_platform(:ios)

# `npx cap add ios`が生成するXcodeプロジェクトの実体は`ios-app/`直下ではなく
# `ios-app/ios/App/App.xcodeproj`にある。fastlaneはこの`fastlane/`の親
# (=`ios-app/`)をカレントディレクトリとして実行されるため、`agvtool`を使う
# アクション(increment_version_number/increment_build_number)とbuild_appには
# 必ず明示的にプロジェクトパスを渡す(渡さないと「カレントディレクトリに
# .xcodeprojが無い」エラーになる。実際にCIで踏んだ不具合)。
# Capacitor 8のSPM構成のため`.xcworkspace`は存在せず、`.xcodeproj`を直接指定する。
XCODEPROJ_PATH = "ios/App/App.xcodeproj"

platform :ios do
  desc "Build and upload a release build to TestFlight"
  lane :release do
    key_id = ENV["ASC_KEY_ID"]
    issuer_id = ENV["ASC_ISSUER_ID"]

    api_key = app_store_connect_api_key(
      key_id: key_id,
      issuer_id: issuer_id,
      key_content: ENV["ASC_KEY_CONTENT"],
      is_key_content_base64: true,
    )

    increment_version_number(xcodeproj: XCODEPROJ_PATH, version_number: ENV["MARKETING_VERSION"])
    increment_build_number(xcodeproj: XCODEPROJ_PATH, build_number: ENV["BUILD_NUMBER"])

    # `npx cap add ios`直後のプロジェクトはCODE_SIGN_STYLE=Automaticだが
    # DEVELOPMENT_TEAMが未設定なので、CIでは署名対象チームを明示的に書き込む。
    update_code_signing_settings(
      use_automatic_signing: true,
      path: XCODEPROJ_PATH,
      team_id: ENV["ASC_TEAM_ID"],
    )

    # CODE_SIGN_STYLE=Automaticの下でCODE_SIGN_IDENTITYを手動指定すると、
    # Xcodeが「App is automatically signed for development, but a
    # conflicting code signing identity Apple Distribution has been
    # manually specified」とエラーにする(併用不可)。正しい修正は、
    # `npx cap add ios`直後のプロジェクトに残っていた旧形式の
    # `CODE_SIGN_IDENTITY = "iPhone Developer"`のハードコードを
    # `ios-app/ios/App/App.xcodeproj/project.pbxproj`から直接削除すること
    # (Debug/Release両方)。identityを一切指定しなければ、Automatic署名が
    # ビルドアクションに応じて適切な証明書種別を自分で判断してくれる。

    # gym(build_app)はapp_store_connect_api_keyの資格情報をxcodebuildの
    # クラウド署名(-allowProvisioningUpdates)へ自動転送しない(fastlane公式でも
    # 「あったら便利だが未実装」として認識されている既知の制約。
    # https://github.com/fastlane/fastlane/discussions/19973 )。
    # .p8の内容を一時ファイルに書き出し、-authenticationKeyPath等をxcargsで
    # 明示的に渡す。渡さないと「No Accounts: Add a new account in Accounts
    # settings.」でローカルXcodeアカウントでの署名にフォールバックしようとして失敗する。
    key_file = Tempfile.new(["asc_key", ".p8"])
    key_file.write(Base64.decode64(ENV["ASC_KEY_CONTENT"]))
    key_file.close

    build_app(
      scheme: "App",
      project: XCODEPROJ_PATH,
      export_method: "app-store",
      export_team_id: ENV["ASC_TEAM_ID"],
      xcargs: "-allowProvisioningUpdates " \
              "-authenticationKeyPath '#{key_file.path}' " \
              "-authenticationKeyID #{key_id} " \
              "-authenticationKeyIssuerID #{issuer_id}",
    )

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

## App Store Connect 掲載情報

アプリ名・サブタイトル・説明文・キーワード・カテゴリ・審査ノートなどの下書きは [ios-app/app-store-listing.md](../../../ios-app/app-store-listing.md) にまとめてある。App Store Connectでアプリを登録する際はそこからコピーして使う。

## Apple Developer Program登録から初回TestFlightアップロードまでのチェックリスト

実際にゼロから初回成功までたどった手順。将来、別アカウント・別アプリで同じ道のりを踏む場合はこの順で進める（前工程が終わっていないと次工程に進めない依存関係があるため、順序を変えない）。

1. **Apple Developer Programへの登録・承認を待つ。**（Apple審査、数日〜要すことがある）
2. **Bundle ID（App ID）を登録する。** [developer.apple.com/account/resources/identifiers/list](https://developer.apple.com/account/resources/identifiers/list) → `+` → App IDs → App → Bundle ID: Explicit・`com.wahattori.threedosero` → Capabilitiesは何もチェックしない（[App ID登録時のCapabilities](#app-id登録時のcapabilities)節参照）。
3. **App Store Connectでアプリを作成する。** [appstoreconnect.apple.com/apps](https://appstoreconnect.apple.com/apps) → `+` → New App → Bundle IDは手順2で登録したものを選択（登録済みでないと選択肢に出てこない）。
4. **App Store Connect APIキーを発行する。** [appstoreconnect.apple.com/access/integrations/api](https://appstoreconnect.apple.com/access/integrations/api) → Generate API Key → **Access: Admin**（後述「APIキーの権限」参照。App Managerでは足りない可能性がある）→ `.p8`ファイルをダウンロード（**この画面でしか取得できない**）・Key ID・Issuer IDを記録する。
5. **GitHub Secretsを4つ設定する。** `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_KEY_CONTENT`（`.p8`をbase64化: `base64 -w0 AuthKey_XXXX.p8`）/ `ASC_TEAM_ID`。詳細は[署名: App Store Connect APIキー方式](#署名-app-store-connect-apiキー方式)節。
6. **デバイスを最低1台登録する。** [developer.apple.com/account/resources/devices/list](https://developer.apple.com/account/resources/devices/list) → `+` → 手元のiPhoneのUDID等を登録する。**これを飛ばすと初回archiveが必ず失敗する**（後述「デバイス登録が必須」参照）。App Store配布が目的でも、archive処理自体はDevelopment用プロビジョニングプロファイルの発行可否も検証するため。
7. **`app-store-release` EnvironmentにRequired reviewersを設定する。** GitHub Settings → Environments → `app-store-release` → Required reviewers（[CI: .github/workflows/ios-release.yml](#ci-githubworkflowsios-releaseyml)節）。
8. **`ios-release.yml`を`workflow_dispatch`で手動起動し、承認する。** 初回成功までデバッグが数ラウンド発生する前提でよい（下記「エッジケース・注意点」に既知の不具合と対処を記録済み）。

### APIキーの権限（Admin vs App Manager）

配布用証明書のクラウド署名にはApp Store Connect APIキーに**Admin**権限が必要、という報告が複数のApple Developer Forumsスレッドにある（[Apple Developer Forums #698117](https://developer.apple.com/forums/thread/698117)、[fastlane Discussion #19973](https://github.com/fastlane/fastlane/discussions/19973)）。

ただし実際にこのプロジェクトで踏んだ不具合は、**App Managerキーのときと、Adminキーに切り替えた後（デバイス未登録の間）とで、どちらも全く同じ「Your team has no devices from which to generate a provisioning profile」エラーが再現しており**、最終的にエラーが解消したのは「デバイスを1台登録した」ことによる（下記「デバイス登録が必須」参照）。つまり**Admin権限への切り替えが実際に必要だったのかは、このプロジェクトの実験だけでは確証が取れていない**（App Managerキーのままデバイスを登録した場合にどうなるかは未検証）。それでも、Apple公式フォーラムの複数の報告と一致する挙動（配布用証明書のクラウド管理にはAdmin相当の権限が必要）を踏まえ、**新規に発行する際はAdminにしておくことを推奨する**（発行し直しの手間を考えると、最初からAdminにしておく方が安全側に倒せるため）。

## エッジケース・注意点

1. **`ios-app/ios/`はコミット対象**（Xcodeプロジェクトファイル一式）だが、`ios-app/www/`（Web資産のコピー）と`ios-app/node_modules/`は`.gitignore`で除外する生成物。
2. **`appId`は登録後に事実上変更不可**。App Store Connectで最初にアプリを作成する前に、この文書とCLAUDE.mdの値が最終確定していることを確認する。
3. **ビルド番号(`CFBundleVersion`)は同一アプリ内で後戻りできない**。`github.run_number`を使うことで、ワークフローを再実行しない限り自然に単調増加する前提を壊さないよう注意する。
4. **初回のCI実行は高確率でデバッグが必要**（実際に9回失敗させてから初成功した）。以下5〜10は、その過程で実際に踏んだ不具合とその対処。新規セットアップ時に一つずつ再現するとは限らないが、同種の署名エラーが出た場合はまずここを疑う。
5. **`agvtool`系アクション（`increment_version_number`/`increment_build_number`）・`build_app`には必ず`xcodeproj:`/`project:`でパスを明示する。** 実際に初回CI実行で`increment_version_number`が「カレントディレクトリに.xcodeprojが無い」エラーで失敗した（`ios-app/fastlane/Fastfile`のカレントディレクトリは`ios-app/`だが、Xcodeプロジェクトの実体は`ios-app/ios/App/App.xcodeproj`にあり一致しないため）。`ios-app/fastlane/Fastfile`の`XCODEPROJ_PATH`定数を参照。
6. **`npx cap add ios`直後の`App.xcodeproj`は`CODE_SIGN_STYLE=Automatic`だが`DEVELOPMENT_TEAM`が空**なので、誰もApple IDでサインインしていないCIランナーでは署名対象チームが決まらず`build_app`が「Signing for "App" requires a development team」で失敗する。`release`レーンで`update_code_signing_settings(team_id: ENV["ASC_TEAM_ID"])`を実行してこれを解消する。実際に初回CI実行で踏んだ不具合。
7. **`build_app`（gym）は`app_store_connect_api_key`で取得した資格情報を、xcodebuildのクラウド署名（`-allowProvisioningUpdates`）へ自動転送しない。** `xcargs: "-allowProvisioningUpdates"`だけを渡しても、xcodebuildは資格情報を持たないためローカルXcodeアカウントでの署名にフォールバックしようとし、「No Accounts: Add a new account in Accounts settings.」「No profiles for '...' were found」で失敗する（fastlane公式でも「あったら便利だが未実装」として認識されている既知の制約。[GitHub Discussion #19973](https://github.com/fastlane/fastlane/discussions/19973)）。`.p8`の内容を一時ファイルに書き出し、`-authenticationKeyPath`/`-authenticationKeyID`/`-authenticationKeyIssuerID`をxcargsで明示的に渡す必要がある（`ios-app/fastlane/Fastfile`参照）。実際に初回CI実行で踏んだ不具合。
8. **`CODE_SIGN_STYLE = Automatic`の下で`CODE_SIGN_IDENTITY`を手動指定してはいけない（併用不可）。** `npx cap add ios`直後の`App.xcodeproj`は`CODE_SIGN_IDENTITY`が両Configuration（Debug/Release）とも旧形式の`"iPhone Developer"`（＝Development証明書）に固定されている。この状態のままだとarchive時にも配布用ではなく開発用のプロビジョニングプロファイルが要求され、「Communication with Apple failed: Your team has no devices from which to generate a provisioning profile」で失敗する。**これを`update_code_signing_settings(code_sign_identity: "Apple Distribution")`で上書きしようとするのは誤り**で、今度はXcodeが「App is automatically signed for development, but a conflicting code signing identity Apple Distribution has been manually specified」と拒否する（Automatic署名下でのidentity手動指定そのものが矛盾と見なされるため）。正しい修正は、`ios-app/ios/App/App.xcodeproj/project.pbxproj`から`CODE_SIGN_IDENTITY = "iPhone Developer";`の行をDebug/Release両方から**削除**すること。identityを一切指定しなければ、Automatic署名がビルドアクション（archiveなら配布用）に応じて適切な証明書種別を自分で判断してくれる。実際に初回CI実行で段階的に踏んだ不具合（`fix_fastlane_release_cert_identity`で一度誤った方向に進み、後続コミットで是正した）。
9. **`update_code_signing_settings`は呼び出すたびに`CODE_SIGN_STYLE`を無条件で書き込み、`use_automatic_signing:`のデフォルトは`false`。** 「渡さなかったパラメータは前回の値を保持する」という選択的な挙動をするのは`team_id`/`code_sign_identity`など個別項目だけで、`CODE_SIGN_STYLE`自体は常に`use_automatic_signing`の値で上書きされる。このアクションを複数回呼ぶ設計にする場合は、2回目以降も`use_automatic_signing: true`を省略しないこと（省略すると直前の呼び出しでAutomaticにした設定がManualに戻り、「"App" requires a provisioning profile. Select a provisioning profile in the Signing & Capabilities editor.」で即失敗する）。
10. **【最終的な決め手】Apple Developerアカウントにデバイスが1台も登録されていないと、配布用（App Store export）のarchiveであっても必ず失敗する。** `xcodebuild archive`は、最終的にDistribution用にエクスポートする場合でも、archiveの過程で開発用（Development）のプロビジョニングプロファイルも要求する。開発用プロファイルはApple仕様上デバイス登録が必須のため、「Communication with Apple failed: Your team has no devices from which to generate a provisioning profile」「No profiles for '...' were found: ... iOS App Development provisioning profiles」で失敗し続ける。[Certificates, Identifiers & Profiles → Devices](https://developer.apple.com/account/resources/devices/list)で実機のUDIDを最低1台登録すれば解消する。**このプロジェクトで最終的に成功した決め手はこれであり、APIキーをAdmin権限にしたこと単体では解消しなかった**（Admin権限への切り替え直後、デバイス未登録の間は同一エラーが再現している）。エラーメッセージ自体が「Connect a device to use or manually add device IDs」と対処法を教えてくれているので、同じ文言のエラーが出たら真っ先にこれを疑う。

## 古いMacでのローカルデバッグの限界

「実機ビルド・コード署名・TestFlight/App Store提出にはmacOS + Xcodeが必須」と冒頭で述べたが、**手元のMacが古い場合はローカルで到達できる範囲がさらに制限される**ことに注意する。

- インストールできるXcodeのバージョンはmacOS本体のバージョンで頭打ちになる（例: macOS Ventura 13.5〜13.7系はXcode 15.2までしか対応しない。Xcode 15.3以降はSonoma 14以上、Xcode 26系はSequoia 15.6以上が必要）。
- Appleは新規App Store提出に使えるXcode/SDKの最低バージョンを年1回程度のペースで引き上げている（2026年4月28日以降はXcode 26 / iOS 26 SDK以上が必須）。この要件は「デプロイターゲット（対応iOSバージョン）」ではなく「**ビルドに使うXcode/SDKのバージョン**」に対するものなので、アプリの対応OSを下げても回避できない。
- したがって、**手元のMacのmacOSが古くApple側の最新Xcode要件を満たせない場合、そのMacで`fastlane release`（TestFlightアップロード）まで実行しても意味がない**（成功しても提出時にreject、または署名要件で失敗する可能性が高い）。ローカルMacの用途は[ios-app/README.mdの「fastlaneでのデバッグ」節](../../../ios-app/README.md#fastlaneでのデバッグ)にある`build_local`（署名なしビルド確認）とXcode上でのシミュレータ実行までに留め、実際のTestFlight提出はCI（`macos-latest`ランナー、常に現行Xcodeを使用）に委ねる。これは「ローカルが使えない場合のフォールバック」ではなく、[スコープと前提](#スコープと前提)節で述べた**もともとの設計**（CI化した方がClaude側から見える化・修正しやすい）そのものである。
