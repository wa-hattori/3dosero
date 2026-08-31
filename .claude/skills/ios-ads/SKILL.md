---
name: ios-ads
description: iOSアプリ版でのインタースティシャル広告（AdMob）表示の正本。Web版には広告を入れない。src/ads/配下の実装またはレビュー時は必ずこれを参照し、独自に再導出しない。
---

# iOS版インタースティシャル広告の正本

対局終了後、数回に1回インタースティシャル広告を表示する。**Web版には広告を一切入れない**（[ios-native-packaging](../ios-native-packaging/SKILL.md)で構築したWeb本体のゼロ依存・広告なしの性質を保つ）。

## スコープと前提

- 広告ネットワークは **Google AdMob**（`@capacitor-community/admob`）を使う。
- 広告形式は**インタースティシャル（全画面広告）のみ**。バナー・リワード広告はv1のスコープ外。
- 表示タイミング: 対局終了（`createEndScreen`表示）のたびにカウントし、**`AD_INTERSTITIAL_FREQUENCY`局に1回**だけ表示する（目安値3。頻度を上げすぎると離脱・アンインストールが増え、かえって生涯表示回数＝収益が下がりうるため、収益目的で安易に上げない）。
- カウンタはアプリ起動中のみ有効なメモリ上の値とする（`localStorage`等での永続化はv1のスコープ外。アプリを再起動すればカウントは0に戻る）。
- **収益の期待値について**: 個人開発・宣伝なしの規模では、広告収益は象徴的な金額に留まる可能性が高い（Apple Developer Programの年会費すら賄えないことも十分あり得る）。本機能は「一応マネタイズの仕組みを持たせておく」位置づけであり、頻度の細かいチューニングよりもユーザー数の方が支配的な変数である。

## なぜCapacitor pluginをビルドツールなしで使えるか

`@capacitor-community/admob`（8.1.0）とその依存先`@capacitor/core`（8.5.0）は、いずれも jsdelivr 経由でESモジュールとして配信されていることを確認済み（`three`/`onnxruntime-web`/`firebase`と同じCDN方式）:

```
https://cdn.jsdelivr.net/npm/@capacitor/core@8.5.0/dist/index.js
https://cdn.jsdelivr.net/npm/@capacitor-community/admob@8.1.0/dist/esm/index.js
```

## モジュール構成（`src/ads/`）

`src/logic/`（純粋関数・DOM/three/非同期I/O禁止）とも独立したモジュール群にする。`src/net/`が`room-code.js`（純粋）と`room-sync.js`（I/O）に分けた構成を踏襲する。

- `src/ads/ad-frequency.js` — 「今回の対局終了で広告を表示すべきか」を判定する**純粋関数**。AdMob・Capacitorへの依存なし。Node標準テストで検証する。
- `src/ads/interstitial-ads.js` — 実際のCapacitor/AdMob呼び出し（初期化・ATT許可・UMP同意・広告表示）。自動テスト対象外（[testing](../../rules/common/testing.md)の方針、`src/net/room-sync.js`と同じ扱い）。

### `ad-frequency.js`（疑似コード）

```
function shouldShowInterstitial(gamesCompletedCount, frequency = AD_INTERSTITIAL_FREQUENCY):
  return gamesCompletedCount > 0 and gamesCompletedCount % frequency == 0
```

### `interstitial-ads.js`（疑似コード）

```
function isNativeIOS():
  # window.Capacitorはネイティブシェル内でのみ自動的に注入されるグローバル。
  # Web版ではこの関数は常にfalseを返し、以降の一切のコードパス
  # (Capacitor/AdMobのCDNモジュール取得を含む)に到達しない。
  return typeof window !== 'undefined'
    and window.Capacitor?.isNativePlatform?.() == true
    and window.Capacitor?.getPlatform?.() == 'ios'

let gamesCompletedThisSession = 0
let admobInitialized = false

async function notifyGameEnded():
  if not isNativeIOS(): return
  gamesCompletedThisSession += 1
  if not shouldShowInterstitial(gamesCompletedThisSession): return

  # AdMob本体・ATT許可・UMP同意フローはすべてネイティブ実行時にのみ動的importする。
  # Web版はこの行自体に到達しないため、@capacitor-community/admobを一切フェッチしない。
  { AdMob } = await import('@capacitor-community/admob')

  if not admobInitialized:
    await AdMob.initialize()  # ATT許可ダイアログ・UMP同意フォームをこの中でハンドリングする
    admobInitialized = true

  await AdMob.prepareInterstitial({ adId: INTERSTITIAL_AD_UNIT_ID })
  await AdMob.showInterstitial()
```

`src/main.js`側の変更は、対局終了（`applyMoveAndAdvance`が`isOver`を検知した箇所、および`subscribeToRoom`のオンライン対戦終局コールバック）で`notifyGameEnded()`を呼ぶ1行の追加のみに留める。

## 広告ユニットID・AdMob App IDの扱い

`src/net/firebase-config.js`と同じ「プレースホルダーを実際の値に差し替える」パターンを踏襲する。

- **広告ユニットID**（インタースティシャル用）: `src/ads/ad-config.js`にプレースホルダーとして持つ。AdMobアカウント作成・アプリ登録後、実際のIDに差し替える。
- **AdMob App ID**: `ios-app/ios/App/App/Info.plist`の`GADApplicationIdentifier`キーに設定する（広告ユニットIDとは別物、アプリ単位で1つ）。

### Googleのテスト用ID（AdMobアカウント作成前の開発・動作確認用）

Googleが公式に配布している、実際の広告を消費しない安全なテスト用ID。本番IDに差し替えるまではこちらを使う:

| 用途 | テスト用ID |
|---|---|
| iOS AdMob App ID | `ca-app-pub-3940256099942544~1458002511` |
| iOS インタースティシャル広告ユニットID | `ca-app-pub-3940256099942544/4411468910` |

**本番の広告ユニットID・App IDに差し替えないまま申請すると、テスト広告がユーザーに配信されてしまう（規約違反）。TestFlight提出前に必ず実際の値に置き換えること。**

## プライバシー・審査への影響（要対応）

広告SDKの追加は、既存の成果物のいくつかを陳腐化させる。実装時に必ず更新すること:

1. **`privacy.html`の書き換え**: 現状「広告SDK・トラッキングを使用しません」と明記しているが、これは虚偽記載になる。iOS版のみ広告を使う旨、収集されるデータの種類（後述）を追記する。
2. **App Tracking Transparency (ATT)**: iOS 14.5以降、広告のターゲティング・効果測定のためにIDFA（端末識別子）を使う場合、起動時にOSの許可ダイアログを出す必要がある。`ios-app/ios/App/App/Info.plist`に`NSUserTrackingUsageDescription`（許可を求める理由の文言）を追加する。拒否された場合も広告自体は非パーソナライズ広告として表示できる（`AdMob.initialize()`がこのフローをハンドリングする）。
3. **UMP（User Messaging Platform、EU/UK/スイス向け同意）**: AdMobの規約上、EEA/UK/スイスのユーザーが対象になりうる場合は同意管理プラットフォームの実装が必須（Googleの規約）。日本向けアプリでも、App Store経由でどの地域からもダウンロードされうるため対応する。`AdMob.initialize()`のUMPフローに含める。
4. **App Store Connectの「App Privacy」申告の更新**: 広告SDKが収集するデータ種別（識別子・使用状況データ等）をApp Store Connect上で申告し直す。これはApp Store Connect上の手動作業。

## エッジケース

1. **AdMobアカウント未作成の間**: テスト用IDで動作確認する。本番IDへの切り替えを忘れないよう、`ad-config.js`にプレースホルダー判定用のヘルパー（`firebase-config.js`の`isFirebaseConfigured()`と同様）を用意する。
2. **Web版での誤動作防止**: `isNativeIOS()`のチェックを必ず先頭で行い、Web版では`@capacitor-community/admob`のfetchすら発生しないことをコードレビューで確認する。
3. **オンライン対戦との組み合わせ**: オンライン対戦の終局は`subscribeToRoom`のコールバック側で検知されるため、ローカル対戦・CPU対戦の終局検知（`applyMoveAndAdvance`）と両方から`notifyGameEnded()`を呼ぶ必要がある。呼び忘れに注意。
