import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONS_3D } from './flip-rule.js';

test('DIRECTIONS_3D has 26 vectors', () => {
  assert.equal(DIRECTIONS_3D.length, 26);
});

test('DIRECTIONS_3D does not include the zero vector', () => {
  const hasZeroVector = DIRECTIONS_3D.some(([dx, dy, dz]) => dx === 0 && dy === 0 && dz === 0);
  assert.equal(hasZeroVector, false);
});

test('DIRECTIONS_3D has no duplicate vectors', () => {
  const keys = new Set(DIRECTIONS_3D.map(([dx, dy, dz]) => `${dx},${dy},${dz}`));
  assert.equal(keys.size, 26);
});

test('every DIRECTIONS_3D component is -1, 0, or 1', () => {
  const isValidComponent = (n) => n === -1 || n === 0 || n === 1;
  const allValid = DIRECTIONS_3D.every(
    ([dx, dy, dz]) => isValidComponent(dx) && isValidComponent(dy) && isValidComponent(dz),
  );
  assert.equal(allValid, true);
});
