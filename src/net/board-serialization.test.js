import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBoard } from '../logic/board.js';
import { deserializeBoard, serializeBoard } from './board-serialization.js';

test('serializeBoard converts an Int8Array into a plain array', () => {
  const board = createInitialBoard(4);
  const serialized = serializeBoard(board);
  assert.ok(Array.isArray(serialized));
  assert.equal(serialized.length, board.length);
  assert.deepEqual(serialized, Array.from(board));
});

test('deserializeBoard converts a plain array back into an Int8Array', () => {
  const plain = [0, 1, 2, 0];
  const board = deserializeBoard(plain);
  assert.ok(board instanceof Int8Array);
  assert.deepEqual(Array.from(board), plain);
});

test('serializeBoard then deserializeBoard round-trips to an equivalent board', () => {
  const original = createInitialBoard(6);
  const roundTripped = deserializeBoard(serializeBoard(original));
  assert.deepEqual(Array.from(roundTripped), Array.from(original));
});
