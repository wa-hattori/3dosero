# App Store Connect 掲載情報（下書き）

正本: [ios-native-packaging/SKILL.md](../.claude/skills/ios-native-packaging/SKILL.md)。App Store Connectでアプリを登録する際、以下の内容をそのままコピーして使う想定。文字数制限はApple公式の上限。

## 基本情報

| 項目 | 値 |
|---|---|
| App名（30文字以内） | 三次元オセロ |
| Bundle ID | `com.wahattori.threedosero` |
| Primary Language | 日本語 |
| カテゴリ（Primary） | ゲーム > ボード（Board） |
| カテゴリ（Secondary、任意） | ゲーム > ストラテジー（Strategy） |
| 価格 | 無料 |
| 年齢制限 | 4+想定（暴力表現・不適切コンテンツなし）。ただしAdMob広告表示のため、年齢別レーティング質問票の「サードパーティ広告」の項目は「あり」と回答する |
| Copyright | `2026 wa-hattori` |
| プライバシーポリシーURL | `https://wa-hattori.github.io/3dosero/privacy.html` |
| サポートURL | `https://github.com/wa-hattori/3dosero/issues` |
| マーケティングURL（任意） | `https://wa-hattori.github.io/3dosero/` |

## サブタイトル（30文字以内）

```
8×8×8の立体で遊ぶオセロ対戦
```

## プロモーションテキスト（170文字以内、審査不要でいつでも更新可）

```
8×8×8、8層に積み重なった立体盤面で遊ぶ本格オセロ。上下・斜めを含む26方向すべてで石を挟んで反転できます。自己対戦強化学習で鍛えたAIとの対戦、友達との対人戦、オンライン対戦にも対応。1人でも、誰かとでも楽しめます。
```

## 説明文（4000文字以内）

```
「三次元オセロ」は、8×8のオセロ盤を8層積み重ねた、8×8×8の立体グリッドで遊ぶ新感覚のオセロ（リバーシ）です。

■ ルールは立体になっただけ、直感はそのまま
通常のオセロと同じく、石を置いたときに相手の石を自分の石で挟めば反転します。ただし挟む方向は平面上の8方向だけでなく、上下方向、そして立体的な斜め方向を含む全26方向。盤面が縦にも奥行きにも広がることで、これまでのオセロにはなかった読みの深さが生まれます。

■ 触ってわかる3D操作
盤面はマウス・タッチでぐるぐる回転させたり拡大縮小したりできます。全体を見渡すのはもちろん、特定の層（高さ）だけに絞り込んで表示する機能もあるので、複雑な立体盤面でも今どこに石があるか迷いません。

■ 自己対戦で鍛えたAIと対戦
CPU対戦相手は、AlphaZeroと同じ仕組み（方策・価値ネットワーク＋モンテカルロ木探索）による自己対戦強化学習で鍛えました。強さの異なる5段階のレベルから選んで対戦できます。すべての推論は端末上で完結し、外部サーバーとの通信は行いません。

■ 友達と対人戦も、オンラインでも
同じ端末でのローカル対人戦はもちろん、ルームコードを共有しての対戦や、ランダムマッチングによるオンライン対戦にも対応。離れた相手とも立体オセロならではの駆け引きを楽しめます。

■ シンプルで安心
・アカウント登録不要
・個人情報の収集なし
・CPU対戦・対人戦（同一端末）はオフラインでプレイ可能

盤面の縦・横・高さすべてを使う、新しいオセロ体験をお楽しみください。
```

## キーワード（100文字以内、カンマ区切り）

```
オセロ,リバーシ,3D,立体,ボードゲーム,対戦ゲーム,オンライン対戦,CPU対戦,AI,パズル,思考ゲーム,無料
```

## App Privacy（データ収集の申告）

App Store Connectの「App Privacy」質問票で申告が必要な項目。詳細は[privacy.html](../privacy.html)参照。

| データ種別 | 収集するか | 用途 | 紐付け |
|---|---|---|---|
| Identifiers（Device ID等） | あり（AdMob経由、ATT許可時のみパーソナライズ広告に使用） | 広告 | 本人に紐付けない（匿名） |
| Usage Data | なし | — | — |
| Diagnostics | なし | — | — |
| Firebase匿名認証のuid | あり | アプリの機能（オンライン対戦のマッチング） | 本人に紐付けない（匿名・端末/インストールごとにリセットされうる） |

## スクリーンショット・プレビュー動画

実機/シミュレータでのプレイ画面が必要（Mac環境でのビルド後に撮影）。最低限、以下のカットを用意すると分かりやすい:
1. スタート画面（対戦モード選択）
2. 立体盤面を回転させた状態（3D感が伝わるアングル）
3. 層を絞り込んで表示した状態
4. 対局中（石が反転する瞬間、または終局のリザルト画面）

## 審査ノート（App Review向け、任意）

```
This is a 3D Othello (Reversi) game with three modes: CPU, local
(same-device), and online. CPU and local modes run fully offline; the
on-device CPU opponent runs entirely locally via onnxruntime-web/native
inference. Online mode uses Firebase (Cloud Firestore) with anonymous
authentication to sync moves between two players in real time — no
account or personal data is collected. The app shows an occasional
interstitial ad via Google AdMob (roughly once every few completed
games); App Tracking Transparency permission is requested on first use
and declining it is fully supported (non-personalized ads are shown
instead). See the privacy policy for details:
https://wa-hattori.github.io/3dosero/privacy.html
```

## その他のApp Store Connect設定

上記以外に、App作成時・提出時にApp Store Connect上で聞かれる項目。個人開発・無料・App内課金なしという前提での回答。

- **使用許諾契約（EULA）**: Appleの標準ライセンス契約（Standard Apple License Agreement）のまま。独自のEULAは、サブスクリプション条件・免責事項等の特別な利用規約が必要な場合にのみ使うもので、このアプリには不要。
- **アプリの暗号化に関する書類（輸出コンプライアンス）**: `Info.plist`の`ITSAppUsesNonExemptEncryption=false`（[ios-native-packaging](../.claude/skills/ios-native-packaging/SKILL.md)の「輸出コンプライアンス」節参照）により、通常はビルドごとの質問自体がスキップされる。万一質問された場合は「暗号化を使用している（標準的なHTTPSのみ）」「米国輸出管理規則の免除規定に該当する（独自の暗号化アルゴリズムは実装していない）」と回答する。
- **App Storeの規制と許可**:
  - デジタルサービス法（EU、Trader情報の申告）: 個人開発（法人登録なし）のため「Trader（事業者）に該当しない」を選択する。
  - ベトナムゲームライセンス: 実物資産の取引・ギャンブル性のあるゲーム等が対象で、本アプリ（課金なしの対戦ボードゲーム）は該当しないため空欄のままでよい。
  - 規制対象の医療用デバイス: 該当なし。何もしない。
- **アプリ用共有シークレット**: App内課金（特にサブスクリプション）のレシート検証に使うもの。本アプリはApp内課金自体が無い（上記「App Privacy」節・[ios-native-packaging](../.claude/skills/ios-native-packaging/SKILL.md)の「App ID登録時のCapabilities」参照）ため設定不要、空欄のままでよい。
