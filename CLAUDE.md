# CLAUDE.md — 3dosero プロジェクト設定

このファイルはプロジェクトルートの設定であり、`.claude/` 配下の agents / skills / rules / commands / hooks より優先してユーザーレベル設定を上書きする。作業を始める前に必ず目を通すこと。

## プロジェクト概要

**3dosero** は 8×8×8 の立体盤面で遊ぶ3次元オセロ（リバーシ）。

- **盤面**: 通常の8×8オセロを上下に8枚積み重ねた立体グリッド（座標系: `x, y ∈ [0,7]` は同一平面、`z ∈ [0,7]` は層）。
- **反転ルール**: 石を置いた位置から3次元の26方向（`dx,dy,dz ∈ {-1,0,1}` の組み合わせのうち `(0,0,0)` を除く全て＝同一平面8方向・上下1方向・立体斜め17方向）を走査し、相手石が連続したのち自分の石で終端していれば、その区間をすべて自分の色に反転する。詳細なアルゴリズムの正本は [othello-3d-flip-rule](.claude/skills/othello-3d-flip-rule/SKILL.md)。
- **GUI**: 盤面は緑地に黒線のマス目、着手可能マスは灰色でハイライト。視点操作は全体回転・拡大縮小（VESTA的な3D結晶構造ビューアのイメージ）に加え、層ごとに絞り込んで見るオプションを持つ。
- **配信**: まずはビルドツールなしの素の HTML/CSS/JS で実装し、HTTPS で静的サイトとして公開する。将来的には App Store でのネイティブ配信も視野に入れる。
- **CPU対戦相手**: 自己対戦強化学習（AlphaZero風。「GAN」は文字通りのGenerator/Discriminatorではなく自己対戦を指す）で学習したモデルを、ブラウザ内推論（`onnxruntime-web`、CDN経由・サーバー不要）で使う。レベル1は簡易なランダムCPU、レベル2〜5は学習済みチェックポイントを自己対戦Eloで評価して選定した4段階。学習アルゴリズムの正本は [gan-cpu-self-play](.claude/skills/gan-cpu-self-play/SKILL.md)。

## 現時点のアーキテクチャ方針

- ビルドステップなし。プレーンな ES Modules（`<script type="module">`）で `src/` 配下のJSファイルを直接ブラウザで読み込む構成を基本とする。バンドラは必要になるまで導入しない。
- 3D描画フェーズに入ったら Three.js を導入する。導入後の規約は [.claude/rules/javascript/three-js-conventions.md](.claude/rules/javascript/three-js-conventions.md) に従う。
- **ゲームロジック（盤面状態・着手判定・反転判定）と描画/DOM操作コードは必ずモジュールを分離する。** ロジック側は `three` や DOM APIに一切依存しない純粋関数群にする。理由: ロジックは自動テストで担保し、描画は差し替え可能にするため。
- **GANベースCPU対戦相手の学習コードは `training/` 配下のPythonでオフラインに行う（GPU版Dockerコンテナ、[training/README.md](training/README.md) 参照）。** ブラウザ側の「ビルドツールなし・静的サイト」方針とは独立した領域として扱い、学習用の依存関係（PyTorch等）は `training/` 側の `pyproject.toml` でのみ管理する（ブラウザ側コードのゼロ依存方針には影響させない）。学習済みモデルは盤面サイズ・レベルごとにONNX形式へエクスポートし（`training/export_onnx.py`）、`data/models/{boardSize}/level{N}.onnx` として配置する（生成物のため大きなバイナリはリポジトリにコミットせず、`.gitignore`で除外）。
- **GAN CPUのブラウザ側推論コード（`src/ai/`）は `src/logic/` とは別モジュールとして扱う。** `src/logic/` はDOM/three/非同期I/Oに一切依存しない純粋関数群のままとし、ONNXモデルのロード・非同期推論は `src/ai/` に閉じ込める。純粋なロジック部分（合法手マスク付きsoftmax・サンプリング等）は `onnxruntime-web` への依存を持たない形で切り出し、Node標準テストで検証する。

## JavaScript コーディング規約

一般的なモダンJS規約を採用する。

- **変数宣言**: `const` を基本とし、再代入が必要な場合のみ `let`。`var` は使用しない。
- **等価比較**: 常に `===` / `!==`。`==` / `!=` は使わない。
- **インデント**: スペース2つ。タブは使わない。
- **文の終端**: セミコロンを省略しない。
- **文字列**: シングルクォート `'...'` を基本とし、埋め込みが必要な場合のみテンプレートリテラル。
- **命名規則**:
  - 変数・関数: `camelCase`（例: `isValidMove`, `boardState`）
  - クラス・コンストラクタ: `PascalCase`（例: `GameBoard`）
  - 定数（変更されない設定値）: `UPPER_SNAKE_CASE`（例: `BOARD_SIZE`）
  - ファイル名: `kebab-case.js`（例: `flip-rule.js`）
- **関数**: コールバックや短い関数式にはアロー関数を使う。1関数1責務を守り、ゲームロジックの関数は副作用を持たない純粋関数にする。
- **制御フロー**: ネストを避け、早期return（ガード節）を優先する。
- **マジックナンバー禁止**: `8`（盤面サイズ）のような値も名前付き定数にする。
- **非同期処理**: `Promise` チェーンより `async`/`await` を優先する。
- **コメント/JSDoc**: 公開関数（他モジュールから呼ばれる関数）には JSDoc で引数・返り値を記述する。自明なコードへのコメントは書かない。
- **モジュール**: ES Modules (`import`/`export`) を使用し、`export default` より named export を優先する（リファクタ時の追跡性のため）。

詳細と具体例は [.claude/rules/javascript/style-guide.md](.claude/rules/javascript/style-guide.md) を参照。

## Python コーディング規約

GANベースCPU対戦相手の学習コード（`training/` 配下）に適用する。ブラウザ側のゲーム本体とは実行環境が異なるが、規約としての厳密さは同水準を保つ。

- **フォーマッタ / リンタ**: [ruff](https://docs.astral.sh/ruff/) を使用する（フォーマット・リント・importソートを1ツールに統合できるため）。
- **型ヒント**: 公開関数・クラスの引数・返り値には型ヒントを必須とする。
- **命名規則**:
  - 変数・関数: `snake_case`（例: `is_valid_move`, `board_state`）
  - クラス: `PascalCase`（例: `PolicyValueNetwork`）
  - 定数（変更されない設定値）: `UPPER_SNAKE_CASE`（例: `CHECKPOINT_INTERVAL_STEPS`）
  - ファイル名: `snake_case.py`（例: `board_encoding.py`）
- **インデント**: スペース4つ（PEP 8準拠）。
- **文字列**: ダブルクォート `"..."` を基本とする（`ruff format` のデフォルトに合わせる）。
- **関数**: 1関数1責務を守る。学習ループ本体を除き、副作用を持たない部分（盤面エンコーディング、報酬計算、チェックポイント強さ評価など）は純粋関数として切り出し、テスト可能にする。
- **docstring**: 公開関数・クラスにはGoogleスタイルのdocstringで引数・返り値を記述する。自明なコードへのコメントは書かない。
- **依存管理**: リポジトリ直下の `pyproject.toml` で管理する。

詳細と具体例は [.claude/rules/python/style-guide.md](.claude/rules/python/style-guide.md) を参照。

## Git コミット規約

[Angular commit message guidelines](https://github.com/angular/angular.js/blob/master/DEVELOPERS.md#commits) に従う。

フォーマット:

```
<type>(<scope>): <subject>

<body>

<footer>
```

- ヘッダー（1行目）は必須、100文字以内。`<scope>` は省略可。
- `<type>` は次のいずれか: `feat`（新機能） / `fix`（バグ修正） / `docs`（ドキュメントのみ） / `style`（フォーマット等、動作に影響しない変更） / `refactor`（バグ修正でも機能追加でもないコード変更） / `perf`（パフォーマンス改善） / `test`（テストの追加・修正） / `chore`（ビルド・補助ツール等の変更）。
- `<subject>` は命令形・現在時制（"add" であり "added"/"adds" ではない）、先頭を大文字にしない、末尾にピリオドを付けない。

**このプロジェクトでは、動く単位（1機能・1修正・1ドキュメント更新など）ごとに1コミットを作る。** 複数の関心事を1コミットにまとめない。詳細と粒度の指針は [.claude/rules/common/git-workflow.md](.claude/rules/common/git-workflow.md) を参照。コミット作業自体は `/commit` コマンドまたは `commit-crafter` エージェントに委任できる。

## テスト方針

ゲームロジック（盤面初期化・着手判定・反転判定）は純粋関数として実装し、ユニットテストを必須とする。描画/UIは当面手動確認。詳細は [.claude/rules/common/testing.md](.claude/rules/common/testing.md)。

## `.claude/` の使い分け

- **rules/** — 常に従うべき指針。`common/` は言語非依存（Git運用・テスト方針）、`javascript/` はJS/Three.js固有の規約、`python/` はPython/学習コード固有の規約。作業前提として常に有効。
- **skills/** — コマンドやエージェントから呼び出す再利用可能なワークフロー定義（TDDループ、アトミックコミット手順、3D反転ルールの正本、静的デプロイ手順、バージョンタグ運用手順）。
- **agents/** — 限定的な範囲を持つタスク専門のサブエージェント（ゲームロジックレビュー、Three.js実装、学習コード実装/レビュー、コミット作成）。
- **commands/** — スラッシュコマンド（`/commit`, `/plan-step`）。エージェントやスキルを起動するショートカット。
- **hooks/** — ツール実行時の自動チェック（コミットメッセージのAngular規約検証、`console.log`/`debugger`残留の警告）。`settings.json` で登録。

## 開発の進め方

1. 次のタスクに着手する前に、関連する rules/skills を確認する（不明なら `/plan-step` で短い計画を立てる）。
2. ゲームロジックは TDD ループ（[tdd-loop](.claude/skills/tdd-loop/SKILL.md)）で実装する。
3. 動作確認できたら、その場で `/commit`（または `commit-crafter` エージェント）を使って Angular 形式の小さなコミットを作る。まとめて後でコミットしない。
4. 3D反転ロジックを実装・変更する際は必ず [othello-3d-flip-rule](.claude/skills/othello-3d-flip-rule/SKILL.md) のアルゴリズムを正本として参照し、独自に再導出しない。
