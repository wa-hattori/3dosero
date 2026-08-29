import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, EMPTY, createEmptyBoard, indexOf } from '../logic/board.js';
import { encodeBoardForModel } from './board-encoder.js';

test('encodes an empty board as all-zero own/opponent planes', () => {
  const boardSize = 4;
  const board = createEmptyBoard(boardSize);

  const tensor = encodeBoardForModel(board, BLACK, boardSize);

  assert.equal(tensor.length, 2 * boardSize ** 3);
  assert.ok(tensor.every((value) => value === 0));
});

test('places own stones in channel 0 at the matching flat index', () => {
  const boardSize = 4;
  const board = createEmptyBoard(boardSize);
  const cellCount = boardSize ** 3;
  board[indexOf(2, 1, 3, boardSize)] = BLACK;

  const tensor = encodeBoardForModel(board, BLACK, boardSize);

  assert.equal(tensor[indexOf(2, 1, 3, boardSize)], 1);
  assert.equal(tensor.slice(0, cellCount).reduce((sum, value) => sum + value, 0), 1);
  assert.ok(tensor.slice(cellCount).every((value) => value === 0));
});

test('places opponent stones in channel 1 at the matching flat index', () => {
  const boardSize = 4;
  const board = createEmptyBoard(boardSize);
  const cellCount = boardSize ** 3;
  board[indexOf(0, 0, 0, boardSize)] = WHITE;

  const tensor = encodeBoardForModel(board, BLACK, boardSize);

  assert.equal(tensor[cellCount + indexOf(0, 0, 0, boardSize)], 1);
  assert.ok(tensor.slice(0, cellCount).every((value) => value === 0));
});

test('swapping the encoded color swaps which plane a stone appears in', () => {
  const boardSize = 4;
  const board = createEmptyBoard(boardSize);
  const cellCount = boardSize ** 3;
  board[indexOf(1, 1, 1, boardSize)] = BLACK;

  const encodedForBlack = encodeBoardForModel(board, BLACK, boardSize);
  const encodedForWhite = encodeBoardForModel(board, WHITE, boardSize);

  assert.equal(encodedForBlack[indexOf(1, 1, 1, boardSize)], 1);
  assert.equal(encodedForWhite[cellCount + indexOf(1, 1, 1, boardSize)], 1);
});

test('leaves both planes zero at an empty cell', () => {
  const boardSize = 4;
  const board = createEmptyBoard(boardSize);
  const cellCount = boardSize ** 3;
  assert.equal(board[indexOf(0, 0, 0, boardSize)], EMPTY);

  const tensor = encodeBoardForModel(board, BLACK, boardSize);

  assert.equal(tensor[indexOf(0, 0, 0, boardSize)], 0);
  assert.equal(tensor[cellCount + indexOf(0, 0, 0, boardSize)], 0);
});

test('encodes a corner cell (boundary index) correctly', () => {
  const boardSize = 8;
  const board = createEmptyBoard(boardSize);
  const cellCount = boardSize ** 3;
  board[indexOf(7, 7, 7, boardSize)] = WHITE;

  const tensor = encodeBoardForModel(board, BLACK, boardSize);

  assert.equal(tensor[cellCount + indexOf(7, 7, 7, boardSize)], 1);
});
