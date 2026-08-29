import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, EMPTY, createEmptyBoard, createInitialBoard, indexOf } from './board.js';
import { countStones, getWinner, isGameOver, getNextTurn } from './game-state.js';

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

test('isGameOver is true when a stalemate leaves an empty cell that neither color can capture into', () => {
  const board = createEmptyBoard().fill(BLACK);
  // 唯一の空きマス(7,7,7)はBLACKに囲まれているが、盤上にWHITEが1つも無いため
  // どちらの色も反転条件（相手石の並びの先が自分の石）を満たせない。
  // 盤面が「満杯」でなくてもゲームが終了しうることを確認する。
  board[indexOf(7, 7, 7)] = EMPTY;
  assert.equal(isGameOver(board), true);
});

test('getNextTurn passes to the opponent when they have a valid move', () => {
  const board = createInitialBoard();
  assert.equal(getNextTurn(board, BLACK), WHITE);
});

test('getNextTurn skips back to the same color when the opponent must pass', () => {
  const board = createEmptyBoard();
  board[indexOf(0, 0, 0)] = WHITE;
  board[indexOf(1, 0, 0)] = BLACK;
  // BLACKには着手可能な手がなく（盤外にしか置けない）、WHITEには(2,0,0)への手がある。
  assert.equal(getNextTurn(board, WHITE), WHITE);
});

test('getNextTurn returns null when neither color can move', () => {
  const board = createEmptyBoard().fill(BLACK);
  assert.equal(getNextTurn(board, BLACK), null);
});

test('getNextTurn returns null on a stalemate that still has an empty cell', () => {
  const board = createEmptyBoard().fill(BLACK);
  board[indexOf(7, 7, 7)] = EMPTY;
  assert.equal(getNextTurn(board, BLACK), null);
});

test('isGameOver respects a smaller boardSize (does not read past it)', () => {
  const boardSize = 4;
  const board = createInitialBoard(boardSize);
  assert.equal(isGameOver(board, boardSize), false);
});

test('getNextTurn respects a smaller boardSize', () => {
  const boardSize = 4;
  const board = createInitialBoard(boardSize);
  assert.equal(getNextTurn(board, BLACK, boardSize), WHITE);
});

test('isGameOver respects a boardSize of 6', () => {
  const boardSize = 6;
  const board = createInitialBoard(boardSize);
  assert.equal(isGameOver(board, boardSize), false);
});

test('getNextTurn respects a boardSize of 6', () => {
  const boardSize = 6;
  const board = createInitialBoard(boardSize);
  assert.equal(getNextTurn(board, BLACK, boardSize), WHITE);
});
