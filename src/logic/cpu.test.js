import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, createEmptyBoard, createInitialBoard, indexOf } from './board.js';
import { getValidMoves } from './flip-rule.js';
import { chooseRandomMove } from './cpu.js';

test('chooseRandomMove returns null when there are no valid moves', () => {
  const board = createEmptyBoard();
  assert.equal(chooseRandomMove(board, BLACK), null);
});

test('chooseRandomMove returns one of the valid moves', () => {
  const board = createInitialBoard();
  const validMoves = getValidMoves(board, BLACK).map((move) => move.join(','));
  const move = chooseRandomMove(board, BLACK);
  assert.ok(validMoves.includes(move.join(',')));
});

test('chooseRandomMove can return different moves across many calls', () => {
  const board = createInitialBoard();
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    seen.add(chooseRandomMove(board, BLACK).join(','));
  }
  // 初期局面のBLACKには複数の合法手があるため、50回も引けば2種類以上出るはず
  assert.ok(seen.size > 1);
});

test('chooseRandomMove respects a smaller boardSize', () => {
  const boardSize = 4;
  const board = createInitialBoard(boardSize);
  const validMoves = getValidMoves(board, BLACK, boardSize).map((move) => move.join(','));
  const move = chooseRandomMove(board, BLACK, boardSize);
  assert.ok(validMoves.includes(move.join(',')));
});

test('chooseRandomMove never returns a move for a color with no options even if the other color has moves', () => {
  const boardSize = 4;
  let board = createEmptyBoard(boardSize);
  board[indexOf(0, 0, 0, boardSize)] = WHITE;
  board[indexOf(1, 0, 0, boardSize)] = BLACK;
  // BLACKは盤外にしか置けず着手不可、WHITEは(2,0,0)に着手可能
  assert.equal(chooseRandomMove(board, BLACK, boardSize), null);
  assert.notEqual(chooseRandomMove(board, WHITE, boardSize), null);
});
