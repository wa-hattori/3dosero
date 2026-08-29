import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_SIZE,
  EMPTY,
  BLACK,
  WHITE,
  indexOf,
  isOnBoard,
  createEmptyBoard,
  createInitialBoard,
} from './board.js';

test('BOARD_SIZE is 8', () => {
  assert.equal(BOARD_SIZE, 8);
});

test('EMPTY, BLACK, WHITE are distinct values', () => {
  const values = new Set([EMPTY, BLACK, WHITE]);
  assert.equal(values.size, 3);
});

test('indexOf maps the origin to index 0', () => {
  assert.equal(indexOf(0, 0, 0), 0);
});

test('indexOf increments by 1 when x increases by 1', () => {
  assert.equal(indexOf(1, 0, 0), 1);
});

test('indexOf increments by BOARD_SIZE when y increases by 1', () => {
  assert.equal(indexOf(0, 1, 0), BOARD_SIZE);
});

test('indexOf increments by BOARD_SIZE squared when z increases by 1', () => {
  assert.equal(indexOf(0, 0, 1), BOARD_SIZE * BOARD_SIZE);
});

test('indexOf maps the far corner to the last index', () => {
  const last = BOARD_SIZE * BOARD_SIZE * BOARD_SIZE - 1;
  assert.equal(indexOf(BOARD_SIZE - 1, BOARD_SIZE - 1, BOARD_SIZE - 1), last);
});

test('isOnBoard is true for a coordinate inside the cube', () => {
  assert.equal(isOnBoard(3, 4, 7), true);
});

test('isOnBoard is true for the minimum corner', () => {
  assert.equal(isOnBoard(0, 0, 0), true);
});

test('isOnBoard is true for the maximum corner', () => {
  assert.equal(isOnBoard(BOARD_SIZE - 1, BOARD_SIZE - 1, BOARD_SIZE - 1), true);
});

test('isOnBoard is false when x is negative', () => {
  assert.equal(isOnBoard(-1, 0, 0), false);
});

test('isOnBoard is false when x is BOARD_SIZE or more', () => {
  assert.equal(isOnBoard(BOARD_SIZE, 0, 0), false);
});

test('isOnBoard is false when y is out of range', () => {
  assert.equal(isOnBoard(0, -1, 0), false);
  assert.equal(isOnBoard(0, BOARD_SIZE, 0), false);
});

test('isOnBoard is false when z is out of range', () => {
  assert.equal(isOnBoard(0, 0, -1), false);
  assert.equal(isOnBoard(0, 0, BOARD_SIZE), false);
});

test('createEmptyBoard returns BOARD_SIZE cubed cells', () => {
  const board = createEmptyBoard();
  assert.equal(board.length, BOARD_SIZE * BOARD_SIZE * BOARD_SIZE);
});

test('createEmptyBoard fills every cell with EMPTY', () => {
  const board = createEmptyBoard();
  assert.ok(board.every((cell) => cell === EMPTY));
});

test('createEmptyBoard returns a new board instance on each call', () => {
  assert.notEqual(createEmptyBoard(), createEmptyBoard());
});

test('createInitialBoard places exactly 4 black and 4 white stones', () => {
  const board = createInitialBoard();
  const counts = board.reduce(
    (acc, cell) => ({ ...acc, [cell]: (acc[cell] ?? 0) + 1 }),
    {},
  );
  assert.equal(counts[BLACK], 4);
  assert.equal(counts[WHITE], 4);
  assert.equal(counts[EMPTY], BOARD_SIZE * BOARD_SIZE * BOARD_SIZE - 8);
});

test('createInitialBoard places stones only in the center 2x2x2 cube', () => {
  const board = createInitialBoard();
  for (let z = 0; z < BOARD_SIZE; z++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const isCenter = (x === 3 || x === 4) && (y === 3 || y === 4) && (z === 3 || z === 4);
        if (isCenter) continue;
        assert.equal(board[indexOf(x, y, z)], EMPTY, `(${x},${y},${z}) should be empty`);
      }
    }
  }
});

test('createInitialBoard colors each center cell by (x+y+z) parity', () => {
  const board = createInitialBoard();
  const cases = [
    [3, 3, 3, BLACK],
    [3, 3, 4, WHITE],
    [3, 4, 3, WHITE],
    [3, 4, 4, BLACK],
    [4, 3, 3, WHITE],
    [4, 3, 4, BLACK],
    [4, 4, 3, BLACK],
    [4, 4, 4, WHITE],
  ];
  for (const [x, y, z, expected] of cases) {
    assert.equal(board[indexOf(x, y, z)], expected, `(${x},${y},${z})`);
  }
});
