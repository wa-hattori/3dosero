import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, BLACK, WHITE, createEmptyBoard, indexOf } from './board.js';
import { DIRECTIONS_3D, getFlippableStones, isValidMove, applyMove } from './flip-rule.js';

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

test('flips stones in multiple directions on the same plane at once', () => {
  let board = createEmptyBoard();
  // x方向: (2,3,0)=WHITE, (1,3,0)=BLACK
  board = place(place(board, 2, 3, 0, WHITE), 1, 3, 0, BLACK);
  // y方向: (3,2,0)=WHITE, (3,1,0)=BLACK
  board = place(place(board, 3, 2, 0, WHITE), 3, 1, 0, BLACK);

  const flippable = getFlippableStones(board, 3, 3, 0, BLACK);
  assert.deepEqual(sortStones(flippable), sortStones([[2, 3, 0], [3, 2, 0]]));
});

test('flips opponent stones straight up through layers', () => {
  const board = place(place(createEmptyBoard(), 0, 0, 1, WHITE), 0, 0, 2, BLACK);
  const flippable = getFlippableStones(board, 0, 0, 0, BLACK);
  assert.deepEqual(sortStones(flippable), sortStones([[0, 0, 1]]));
});

test('flips opponent stones along a space diagonal through layers', () => {
  const board = place(place(createEmptyBoard(), 1, 1, 1, WHITE), 2, 2, 2, BLACK);
  const flippable = getFlippableStones(board, 0, 0, 0, BLACK);
  assert.deepEqual(sortStones(flippable), sortStones([[1, 1, 1]]));
});

test('does not flip a run of opponent stones that ends exactly at the board edge with no terminator', () => {
  let board = createEmptyBoard();
  board = place(board, 6, 0, 0, WHITE);
  board = place(board, 7, 0, 0, WHITE);
  const flippable = getFlippableStones(board, 5, 0, 0, BLACK);
  assert.deepEqual(flippable, []);
});

test('flips a full corner-to-corner space diagonal run', () => {
  let board = createEmptyBoard();
  const opponentRun = [[1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4], [5, 5, 5], [6, 6, 6]];
  for (const [x, y, z] of opponentRun) {
    board = place(board, x, y, z, WHITE);
  }
  board = place(board, 7, 7, 7, BLACK);

  const flippable = getFlippableStones(board, 0, 0, 0, BLACK);
  assert.deepEqual(sortStones(flippable), sortStones(opponentRun));
});

test('isValidMove is true when the move would flip at least one stone', () => {
  const board = place(place(createEmptyBoard(), 1, 0, 0, WHITE), 2, 0, 0, BLACK);
  assert.equal(isValidMove(board, 0, 0, 0, BLACK), true);
});

test('isValidMove is false when the move would flip no stones', () => {
  const board = createEmptyBoard();
  assert.equal(isValidMove(board, 0, 0, 0, BLACK), false);
});

test('applyMove places the stone and flips captured stones', () => {
  const board = place(place(createEmptyBoard(), 1, 0, 0, WHITE), 2, 0, 0, BLACK);
  const next = applyMove(board, 0, 0, 0, BLACK);
  assert.equal(next[indexOf(0, 0, 0)], BLACK);
  assert.equal(next[indexOf(1, 0, 0)], BLACK);
  assert.equal(next[indexOf(2, 0, 0)], BLACK);
});

test('applyMove does not mutate the board passed in', () => {
  const board = place(place(createEmptyBoard(), 1, 0, 0, WHITE), 2, 0, 0, BLACK);
  applyMove(board, 0, 0, 0, BLACK);
  assert.equal(board[indexOf(0, 0, 0)], EMPTY);
  assert.equal(board[indexOf(1, 0, 0)], WHITE);
});

test('applyMove returns null for an invalid move and leaves the board untouched', () => {
  const board = createEmptyBoard();
  const next = applyMove(board, 0, 0, 0, BLACK);
  assert.equal(next, null);
  assert.equal(board[indexOf(0, 0, 0)], EMPTY);
});
