---
name: testing
description: ゲームロジックのユニットテスト方針（言語非依存）
---

# テスト方針

## 対象と粒度

- **ゲームロジック（盤面初期化・着手判定・反転判定・勝敗判定など）は純粋関数として実装し、ユニットテストを必須とする。** 入力（盤面状態・座標・手番）に対して出力（新しい盤面状態や真偽値）が決まる関数であること。
- **描画・UI（Three.jsのシーン構築、カメラ操作、DOM操作）は当面自動テスト対象外とし、手動確認とする。** GUIの自動テストは将来必要になった時点で改めて方針を検討する。
- CPU対戦ロジック（将来のGANベース実装含む）は、少なくとも「合法手の中から手を返す」という契約についてはユニットテストで担保する。

## ファイル配置

- テストファイルはテスト対象と同じディレクトリに `*.test.js` として配置する（例: `src/logic/flip-rule.js` → `src/logic/flip-rule.test.js`）。
- テスト用のフィクスチャ（盤面の初期状態など）は共有が必要になった時点で `src/logic/__fixtures__/` に切り出す。

## テストの書き方

- 1テストケースで1つの振る舞いのみを検証する。
- テスト名は「何をしたら何が起きるか」が読めるようにする（例: `flips opponent stones in a straight vertical line`）。
- 境界値（盤面の端、層の最上/最下、石が1つも挟めないケース）を必ずカバーする。3D反転ルールの正本は [othello-3d-flip-rule](../../skills/othello-3d-flip-rule/SKILL.md)。
- テストランナー・アサーションライブラリは Node.js 組み込みの `node --test` + `node:assert/strict` を採用する（追加のnpm依存やビルド設定が不要で、ビルドツールなし方針と一貫するため）。`npm test` で `src/` 配下の `*.test.js` を実行する。

## TDDループ

新しいゲームロジックを実装する際は [tdd-loop](../../skills/tdd-loop/SKILL.md) の Red → Green → Refactor ループに従う。

## Python（学習コード）のテスト方針

対象は `training/` 配下のPythonコード（GANベースCPU対戦相手の学習）。JS側と同様、**副作用のない純粋関数（盤面エンコーディング、報酬計算、チェックポイント強さ評価など）はユニットテスト必須**とする。学習ループそのもの（乱数・GPU・長時間実行に依存する）は自動テスト対象外とし、小規模データでの動作確認（スモークテスト）と手動確認で担保する。[tdd-loop](../../skills/tdd-loop/SKILL.md) のRed→Green→RefactorはPython側の純粋関数部分にも同様に適用するが、学習ループ本体には適用しない。

- テストランナー・アサーションは [pytest](https://docs.pytest.org/) を採用する。
- テストファイルは `test_*.py` として、テスト対象と同じディレクトリに配置する（例: `training/board_encoding.py` → `training/test_board_encoding.py`）。pytestのデフォルト探索規則に従うため。
- `pyproject.toml` の `[tool.pytest.ini_options]` でテスト対象パスを指定する。
- 境界値（盤面の端、空盤面、詰み間際の局面など）を必ずカバーする。
