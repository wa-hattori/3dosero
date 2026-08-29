import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, createEmptyBoard, createInitialBoard, indexOf } from './board.js';
import { countStones } from './game-state.js';

test('countStones returns zero for both colors on an empty board', () => {
  const board = createEmptyBoard();
  assert.deepEqual(countStones(board), { [BLACK]: 0, [WHITE]: 0 });
});

test('countStones counts the initial board as 4 black and 4 white', () => {
  const board = createInitialBoard();
  assert.deepEqual(countStones(board), { [BLACK]: 4, [WHITE]: 4 });
});

test('countStones reflects stones placed after the initial setup', () => {
  const board = createInitialBoard();
  board[indexOf(0, 0, 0)] = BLACK;
  assert.deepEqual(countStones(board), { [BLACK]: 5, [WHITE]: 4 });
});
