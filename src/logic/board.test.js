import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_SIZE, EMPTY, BLACK, WHITE, indexOf, isOnBoard } from './board.js';

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
