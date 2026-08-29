import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, createEmptyBoard, createInitialBoard, indexOf } from './board.js';
import { countStones, getWinner, isGameOver } from './game-state.js';

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

test('getWinner returns the color with more stones', () => {
  const board = createInitialBoard();
  board[indexOf(0, 0, 0)] = BLACK;
  assert.equal(getWinner(board), BLACK);
});

test('getWinner returns the other color when it has more stones', () => {
  const board = createInitialBoard();
  board[indexOf(0, 0, 0)] = WHITE;
  assert.equal(getWinner(board), WHITE);
});

test('getWinner returns null when both colors have the same number of stones', () => {
  const board = createInitialBoard();
  assert.equal(getWinner(board), null);
});

test('isGameOver is false on the initial board, where both colors can move', () => {
  const board = createInitialBoard();
  assert.equal(isGameOver(board), false);
});

test('isGameOver is false when only one color can still move', () => {
  const board = createEmptyBoard();
  board[indexOf(0, 0, 0)] = WHITE;
  board[indexOf(1, 0, 0)] = BLACK;
  // BLACKが挟み返すにはx=-1(盤外)に置く必要があり不可能。WHITEは(2,0,0)に置いて反転できる。
  assert.equal(isGameOver(board), false);
});

test('isGameOver is true when neither color has an empty cell to move into', () => {
  const board = createEmptyBoard().fill(BLACK);
  assert.equal(isGameOver(board), true);
});
