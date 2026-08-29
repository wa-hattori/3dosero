---
name: javascript-style-guide
description: JSコーディング規約の具体例集（正本はCLAUDE.md、本ファイルはコード例で補強）
---

# JavaScript スタイルガイド（具体例）

正本は [CLAUDE.md](../../../CLAUDE.md) の「JavaScript コーディング規約」節。本ファイルはそれを本プロジェクトのドメイン（盤面・座標）に即した具体例で補強する。ルール自体を変更する場合は CLAUDE.md 側を先に更新すること。

## 定数とマジックナンバー

```js
// Bad
if (x < 0 || x >= 8 || y < 0 || y >= 8 || z < 0 || z >= 8) return false;

// Good
export const BOARD_SIZE = 8;

if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE || z < 0 || z >= BOARD_SIZE) {
  return false;
}
```

## 早期return（ガード節）

```js
// Bad
function isOnBoard(x, y, z) {
  if (x >= 0 && x < BOARD_SIZE) {
    if (y >= 0 && y < BOARD_SIZE) {
      if (z >= 0 && z < BOARD_SIZE) {
        return true;
      }
    }
  }
  return false;
}

// Good
function isOnBoard(x, y, z) {
  if (x < 0 || x >= BOARD_SIZE) return false;
  if (y < 0 || y >= BOARD_SIZE) return false;
  if (z < 0 || z >= BOARD_SIZE) return false;
  return true;
}
```

## 盤面状態は不変（immutable）に扱う

ゲームロジックの関数は、渡された盤面を書き換えず新しい盤面を返す。副作用を持たせない。

```js
// Bad: 引数の board を直接書き換える
function applyMove(board, x, y, z, color) {
  board[z][y][x] = color;
  return board;
}

// Good: 新しい配列を返す
function applyMove(board, x, y, z, color) {
  const next = board.map((layer) => layer.map((row) => [...row]));
  next[z][y][x] = color;
  return next;
}
```

盤面データ構造は `Int8Array`（フラット化してパフォーマンスを優先する場合）または `board[z][y][x]` の3重配列（可読性を優先する場合）のいずれかに統一する。実装着手時にどちらを採用するか決め、混在させない。

## 命名の具体例

```js
// 変数・関数: camelCase
const boardState = createInitialBoard();
function isValidMove(board, x, y, z, color) { /* ... */ }

// クラス: PascalCase
class GameBoard { /* ... */ }

// 定数: UPPER_SNAKE_CASE
const DIRECTIONS_3D = [/* ... 26方向 ... */];

// ファイル名: kebab-case
// flip-rule.js, game-board.js, move-validator.js
```

## モジュール分割方針

- `src/logic/` — 盤面・着手・反転・勝敗判定などの純粋関数群。`three` や DOM APIをimportしない。
- `src/render/`（Three.js導入後）— シーン・カメラ・描画コード。`src/logic/` の関数を呼び出すだけで、盤面表現を直接書き換えない。
- `src/ui/` — DOM操作・イベントハンドリング。

## JSDoc の例

```js
/**
 * 指定した座標に石を置いたときに反転する座標一覧を返す。
 * @param {Board} board - 現在の盤面状態
 * @param {{x: number, y: number, z: number}} position - 石を置く座標
 * @param {'black' | 'white'} color - 置く石の色
 * @returns {Array<{x: number, y: number, z: number}>} 反転対象の座標一覧（置けない場合は空配列）
 */
export function getFlippableStones(board, position, color) { /* ... */ }
```
