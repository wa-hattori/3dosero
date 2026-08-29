/**
 * 26方向の探索ベクトル。`(0,0,0)` を除く `dx, dy, dz ∈ {-1, 0, 1}` の全組み合わせ。
 * 正本: [othello-3d-flip-rule](../../.claude/skills/othello-3d-flip-rule/SKILL.md)
 * @type {Array<[number, number, number]>}
 */
export const DIRECTIONS_3D = [];
for (let dz = -1; dz <= 1; dz++) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0 && dz === 0) continue;
      DIRECTIONS_3D.push([dx, dy, dz]);
    }
  }
}
