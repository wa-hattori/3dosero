import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, createEmptyBoard, createInitialBoard, indexOf } from '../logic/board.js';
import { getValidMoves } from '../logic/flip-rule.js';
import { computeLegalMovePolicy, sampleMoveIndex, chooseGanMove } from './gan-cpu.js';

test('computeLegalMovePolicy returns an empty array when there are no legal moves', () => {
  const policyLogits = new Float32Array(4 ** 3);
  assert.deepEqual(computeLegalMovePolicy(policyLogits, [], 4), []);
});

test('computeLegalMovePolicy spreads probability uniformly across equal logits', () => {
  const boardSize = 4;
  const legalMoves = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
  const policyLogits = new Float32Array(boardSize ** 3); // all zeros -> equal logits

  const probabilities = computeLegalMovePolicy(policyLogits, legalMoves, boardSize);

  assert.equal(probabilities.length, 3);
  for (const probability of probabilities) {
    assert.ok(Math.abs(probability - 1 / 3) < 1e-9);
  }
});

test('computeLegalMovePolicy concentrates probability on the highest-logit legal move', () => {
  const boardSize = 4;
  const legalMoves = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
  const policyLogits = new Float32Array(boardSize ** 3);
  policyLogits[indexOf(1, 0, 0, boardSize)] = 100;

  const probabilities = computeLegalMovePolicy(policyLogits, legalMoves, boardSize);
  const sum = probabilities.reduce((total, value) => total + value, 0);

  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(probabilities[1] > 0.999);
  assert.ok(probabilities[0] < 0.001);
  assert.ok(probabilities[2] < 0.001);
});

test('computeLegalMovePolicy reads the logit at each legal move’s own flat index', () => {
  const boardSize = 4;
  const legalMoves = [[3, 2, 1], [0, 0, 0]];
  const policyLogits = new Float32Array(boardSize ** 3);
  policyLogits[indexOf(3, 2, 1, boardSize)] = 5;
  policyLogits[indexOf(0, 0, 0, boardSize)] = -5;

  const probabilities = computeLegalMovePolicy(policyLogits, legalMoves, boardSize);

  assert.ok(probabilities[0] > probabilities[1]);
});

test('sampleMoveIndex returns -1 for an empty probability distribution', () => {
  assert.equal(sampleMoveIndex([], 0.5), -1);
});

test('sampleMoveIndex always returns the only index when there is a single option', () => {
  assert.equal(sampleMoveIndex([1], 0), 0);
  assert.equal(sampleMoveIndex([1], 0.999999), 0);
});

test('sampleMoveIndex picks the bucket containing the random value', () => {
  const probabilities = [0.2, 0.3, 0.5];
  assert.equal(sampleMoveIndex(probabilities, 0), 0);
  assert.equal(sampleMoveIndex(probabilities, 0.19), 0);
  assert.equal(sampleMoveIndex(probabilities, 0.25), 1);
  assert.equal(sampleMoveIndex(probabilities, 0.49), 1);
  assert.equal(sampleMoveIndex(probabilities, 0.5), 2);
  assert.equal(sampleMoveIndex(probabilities, 0.99), 2);
});

test('sampleMoveIndex falls back to the last index when floating-point rounding leaves the cumulative sum short', () => {
  const probabilities = [0.3, 0.3, 0.4];
  assert.equal(sampleMoveIndex(probabilities, 0.9999999999), 2);
});

test('chooseGanMove returns null when there are no valid moves, without calling the session', async () => {
  const board = createEmptyBoard();
  const session = { run: async () => { throw new Error('session.run should not be called'); } };

  const move = await chooseGanMove(board, BLACK, 8, session);

  assert.equal(move, null);
});

test('chooseGanMove returns one of the valid moves for a uniform (all-zero) policy', async () => {
  const boardSize = 8;
  const board = createInitialBoard(boardSize);
  const validMoves = getValidMoves(board, BLACK, boardSize).map((move) => move.join(','));
  const session = {
    run: async () => ({ policyLogits: new Float32Array(boardSize ** 3), value: 0 }),
  };

  const move = await chooseGanMove(board, BLACK, boardSize, session);

  assert.ok(validMoves.includes(move.join(',')));
});

test('chooseGanMove deterministically follows an overwhelmingly confident policy', async () => {
  const boardSize = 8;
  const board = createInitialBoard(boardSize);
  const validMoves = getValidMoves(board, BLACK, boardSize);
  const [favoredMove] = validMoves;
  const policyLogits = new Float32Array(boardSize ** 3);
  policyLogits[indexOf(...favoredMove, boardSize)] = 100;
  const session = { run: async () => ({ policyLogits, value: 0 }) };

  const move = await chooseGanMove(board, BLACK, boardSize, session);

  assert.deepEqual(move, favoredMove);
});

test('chooseGanMove respects a smaller boardSize and encodes the correct color', async () => {
  const boardSize = 4;
  const board = createInitialBoard(boardSize);
  const validMoves = getValidMoves(board, WHITE, boardSize).map((move) => move.join(','));
  const session = {
    run: async () => ({ policyLogits: new Float32Array(boardSize ** 3), value: 0 }),
  };

  const move = await chooseGanMove(board, WHITE, boardSize, session);

  assert.ok(validMoves.includes(move.join(',')));
});

test('chooseGanMove returns the single legal move regardless of the policy when only one option exists', async () => {
  const boardSize = 4;
  const board = createEmptyBoard(boardSize);
  board[indexOf(0, 0, 0, boardSize)] = WHITE;
  board[indexOf(1, 0, 0, boardSize)] = BLACK;
  // WHITEは(2,0,0)にしか置けない。
  const session = {
    run: async () => ({ policyLogits: new Float32Array(boardSize ** 3), value: 0 }),
  };

  const move = await chooseGanMove(board, WHITE, boardSize, session);

  assert.deepEqual(move, [2, 0, 0]);
});
