---
name: othello-3d-flip-rule
description: 8x8x8立体オセロにおける「石を挟んで反転する」判定アルゴリズムの正本（疑似コードとエッジケース）。着手判定・反転判定ロジックを実装またはレビューする時は必ずこれを参照し、独自にルールを再導出しない。
---

# 3Dオセロ 反転ルールの正本

このゲームの核となるルールを一意に定義する。将来どのセッションが実装しても同じ挙動に収束させることが目的。

## 座標系・前提

- 盤面は `x, y, z ∈ [0, BOARD_SIZE-1]`（`BOARD_SIZE = 8`）の立方体グリッド。
- 各マスは `EMPTY` / `BLACK` / `WHITE` のいずれか。
- 石を置く操作は「空マスに石を置き、条件を満たす方向の相手石をすべて自分の色に反転する」。

## 26方向

`(0,0,0)` を除く `dx, dy, dz ∈ {-1, 0, 1}` の全組み合わせ（3³ - 1 = 26通り）。内訳:

- 同一平面（z固定）8方向: `dz = 0` のうち `(dx,dy) ≠ (0,0)`
- 上下方向 1方向×2（+z, -z）: `dx = dy = 0`
- 立体斜め方向: 上記以外の17方向（面対角・空間対角を含む）

```js
export const DIRECTIONS_3D = [];
for (let dz = -1; dz <= 1; dz++) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0 && dz === 0) continue;
      DIRECTIONS_3D.push([dx, dy, dz]);
    }
  }
}
// DIRECTIONS_3D.length === 26
```

## 判定アルゴリズム（疑似コード）

石を `color` の色で `(x0, y0, z0)` に置こうとしている場合、反転対象の座標一覧を次のように求める。

```
function getFlippableStones(board, x0, y0, z0, color):
  if board[z0][y0][x0] !== EMPTY:
    return []  // 既に石がある場所には置けない

  opponent = opposite(color)
  flippable = []

  for each (dx, dy, dz) in DIRECTIONS_3D:
    line = []
    x, y, z = x0 + dx, y0 + dy, z0 + dz

    // その方向に連続する相手石を集める
    while isOnBoard(x, y, z) and board[z][y][x] === opponent:
      line.push((x, y, z))
      x, y, z = x + dx, y + dy, z + dz

    // 相手石の並びの先が盤内かつ自分の石なら、その区間は反転対象
    if line is not empty and isOnBoard(x, y, z) and board[z][y][x] === color:
      flippable.push(...line)

  return flippable
```

- `isOnBoard(x, y, z)`: `0 <= x,y,z < BOARD_SIZE` をすべて満たすか。
- 着手可能判定 `isValidMove(board, x0, y0, z0, color)` は `getFlippableStones(...).length > 0` と等価。
- 実際に石を置く処理は、`(x0,y0,z0)` に `color` を置いたうえで `flippable` の全座標を `color` に変える（[style-guide](../../rules/javascript/style-guide.md) の不変更新パターンに従う）。

## エッジケース

1. **盤端・層端**: `isOnBoard` チェックで盤外に出たら、その方向の探索は反転対象なしとして打ち切る（ループを抜けた時点で `line` は破棄）。
2. **相手石が0個で自分の石に隣接**: `line` が空のまま自分の石に到達した場合は反転対象にしない（隣接するだけでは挟んだことにならない）。
3. **相手石の並びの先が空マスまたは盤外**: 反転対象にしない。
4. **複数方向で同時に反転条件を満たす**: 26方向すべてを独立に判定し、条件を満たした方向の `line` をすべて `flippable` にまとめる（1方向だけでなく該当する全方向を反転する）。
5. **初期配置**: 立体オセロの初期配置は本アルゴリズムの前提（盤面中心付近に黒白を交互配置）とは独立に決める実装タスクであり、本スキルの範囲外。初期配置を決める際は、どの色から見ても対称になるよう配置し、決定したら本ファイルまたは実装コードにコメントで明記する。

## テストへの適用

このアルゴリズムに対するテストケースの積み上げ方は [tdd-loop](../tdd-loop/SKILL.md) の「3D反転ロジックに適用する場合の観点」を参照。
