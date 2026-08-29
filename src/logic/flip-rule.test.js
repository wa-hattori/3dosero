import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, createEmptyBoard, indexOf } from './board.js';
import { DIRECTIONS_3D, getFlippableStones } from './flip-rule.js';

const place = (board, x, y, z, color) => {
  board[indexOf(x, y, z)] = color;
  return board;
};

const sortStones = (stones) => [...stones].sort().map((stone) => stone.join(','));

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

test('flips a single opponent stone in a straight line', () => {
  const board = place(place(createEmptyBoard(), 1, 0, 0, WHITE), 2, 0, 0, BLACK);
  const flippable = getFlippableStones(board, 0, 0, 0, BLACK);
  assert.deepEqual(sortStones(flippable), sortStones([[1, 0, 0]]));
});

test('does not flip when the adjacent cell is empty', () => {
  const board = createEmptyBoard();
  const flippable = getFlippableStones(board, 0, 0, 0, BLACK);
  assert.deepEqual(flippable, []);
});

test('does not flip when an opponent run reaches the edge of the board without a terminating stone', () => {
  const board = place(createEmptyBoard(), 7, 0, 0, WHITE);
  const flippable = getFlippableStones(board, 6, 0, 0, BLACK);
  assert.deepEqual(flippable, []);
});

test('does not flip when the adjacent cell is already the same color', () => {
  const board = place(createEmptyBoard(), 1, 0, 0, BLACK);
  const flippable = getFlippableStones(board, 0, 0, 0, BLACK);
  assert.deepEqual(flippable, []);
});

test('does not allow placing on top of an existing stone', () => {
  const board = place(place(createEmptyBoard(), 0, 0, 0, WHITE), 1, 0, 0, WHITE);
  const flippable = getFlippableStones(board, 0, 0, 0, BLACK);
  assert.deepEqual(flippable, []);
});
