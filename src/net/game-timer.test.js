import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOVE_TIME_LIMIT_MS,
  MAIN_TIME_BANK_MS,
  createInitialTimeBank,
  computeMoveTimeRemainingMs,
  computeMainBankRemainingMs,
  hasTimedOut,
  computeNextTimeBank,
} from './game-timer.js';

test('createInitialTimeBank gives both colors the full main time bank', () => {
  assert.deepEqual(createInitialTimeBank(), { black: MAIN_TIME_BANK_MS, white: MAIN_TIME_BANK_MS });
});

test('computeMoveTimeRemainingMs is the full move limit when no time has elapsed', () => {
  assert.equal(computeMoveTimeRemainingMs(0), MOVE_TIME_LIMIT_MS);
});

test('computeMoveTimeRemainingMs is zero exactly at the move limit', () => {
  assert.equal(computeMoveTimeRemainingMs(MOVE_TIME_LIMIT_MS), 0);
});

test('computeMoveTimeRemainingMs goes negative once the move limit is exceeded', () => {
  assert.equal(computeMoveTimeRemainingMs(MOVE_TIME_LIMIT_MS + 5_000), -5_000);
});

test('computeMainBankRemainingMs subtracts elapsed time from the stored bank', () => {
  assert.equal(computeMainBankRemainingMs(MAIN_TIME_BANK_MS, 10_000), MAIN_TIME_BANK_MS - 10_000);
});

test('computeMainBankRemainingMs can go negative when the bank runs out mid-move', () => {
  assert.equal(computeMainBankRemainingMs(10_000, 15_000), -5_000);
});

test('hasTimedOut is false when both the move timer and main bank still have time left', () => {
  assert.equal(hasTimedOut({ moveTimeRemainingMs: 1_000, mainBankRemainingMs: 60_000 }), false);
});

test('hasTimedOut is true when the move timer has run out', () => {
  assert.equal(hasTimedOut({ moveTimeRemainingMs: 0, mainBankRemainingMs: 60_000 }), true);
});

test('hasTimedOut is true when the main time bank has run out, even mid-move', () => {
  // 持ち時間が一手タイマーより先に尽きるケース(残り持ち時間が一手タイマーの
  // 上限より少ない状態で手番が始まった場合)も検知できる必要がある。
  assert.equal(hasTimedOut({ moveTimeRemainingMs: 20_000, mainBankRemainingMs: 0 }), true);
});

test('computeNextTimeBank gains the full move limit when moving instantly', () => {
  assert.equal(computeNextTimeBank(MAIN_TIME_BANK_MS, 0), MAIN_TIME_BANK_MS + MOVE_TIME_LIMIT_MS);
});

test('computeNextTimeBank loses the full move limit when using the entire move timer', () => {
  assert.equal(
    computeNextTimeBank(MAIN_TIME_BANK_MS, MOVE_TIME_LIMIT_MS),
    MAIN_TIME_BANK_MS - MOVE_TIME_LIMIT_MS,
  );
});

test('computeNextTimeBank is unchanged when moving at exactly half the move limit', () => {
  assert.equal(computeNextTimeBank(MAIN_TIME_BANK_MS, MOVE_TIME_LIMIT_MS / 2), MAIN_TIME_BANK_MS);
});

test('computeNextTimeBank never goes below zero', () => {
  assert.equal(computeNextTimeBank(5_000, 20_000), 0);
});

test('computeNextTimeBank clamps elapsed time beyond the move limit (late/lagged write)', () => {
  assert.equal(
    computeNextTimeBank(MAIN_TIME_BANK_MS, MOVE_TIME_LIMIT_MS + 20_000),
    computeNextTimeBank(MAIN_TIME_BANK_MS, MOVE_TIME_LIMIT_MS),
  );
});
