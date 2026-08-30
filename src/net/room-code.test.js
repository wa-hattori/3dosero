import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from './room-code.js';

test('generateRoomCode returns a code of the expected length', () => {
  const code = generateRoomCode();
  assert.equal(code.length, ROOM_CODE_LENGTH);
});

test('generateRoomCode only uses characters from the room code alphabet', () => {
  const code = generateRoomCode();
  assert.ok([...code].every((char) => ROOM_CODE_ALPHABET.includes(char)));
});

test('generateRoomCode never includes ambiguous characters like 0, O, 1, I, L', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateRoomCode();
    assert.ok(!/[0O1IL]/.test(code));
  }
});

test('generateRoomCode can produce different codes across many calls', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    seen.add(generateRoomCode());
  }
  assert.ok(seen.size > 1);
});

test('normalizeRoomCode uppercases a lowercase code', () => {
  assert.equal(normalizeRoomCode('ab234z'), 'AB234Z');
});

test('isValidRoomCode accepts a freshly generated code', () => {
  assert.equal(isValidRoomCode(generateRoomCode()), true);
});

test('isValidRoomCode accepts a lowercase input of an otherwise valid code', () => {
  assert.equal(isValidRoomCode('ab234z'), true);
});

test('isValidRoomCode rejects a code that is too short', () => {
  assert.equal(isValidRoomCode('AB234'), false);
});

test('isValidRoomCode rejects a code that is too long', () => {
  assert.equal(isValidRoomCode('AB234ZZ'), false);
});

test('isValidRoomCode rejects a code containing an ambiguous excluded character', () => {
  assert.equal(isValidRoomCode('AB23O4'), false);
  assert.equal(isValidRoomCode('AB2304'), false);
  assert.equal(isValidRoomCode('AB231Z'), false);
  assert.equal(isValidRoomCode('AB23IZ'), false);
  assert.equal(isValidRoomCode('AB23LZ'), false);
});

test('isValidRoomCode rejects a code containing a symbol', () => {
  assert.equal(isValidRoomCode('AB23-Z'), false);
});

test('isValidRoomCode rejects non-string input', () => {
  assert.equal(isValidRoomCode(undefined), false);
  assert.equal(isValidRoomCode(null), false);
  assert.equal(isValidRoomCode(234234), false);
});
