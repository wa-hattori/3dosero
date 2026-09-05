import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCORE,
  K_FACTOR,
  MAX_SCORE_DELTA,
  MATCH_RESULT,
  expectedScore,
  calculateEloDelta,
  getTier,
} from './rating.js';

test('expectedScore is 0.5 when both players have the same score', () => {
  assert.equal(expectedScore(1500, 1500), 0.5);
});

test('expectedScore is greater than 0.5 when the player outranks the opponent', () => {
  assert.ok(expectedScore(1700, 1500) > 0.5);
});

test('expectedScore is less than 0.5 when the player is outranked', () => {
  assert.ok(expectedScore(1300, 1500) < 0.5);
});

test('expectedScore stays within (0, 1) for a large rating gap', () => {
  const expected = expectedScore(1000, 3000);
  assert.ok(expected > 0 && expected < 1);
});

test('calculateEloDelta is positive on a win between equally rated players', () => {
  const delta = calculateEloDelta(DEFAULT_SCORE, DEFAULT_SCORE, MATCH_RESULT.WIN);
  assert.ok(delta > 0);
});

test('calculateEloDelta is negative on a loss between equally rated players', () => {
  const delta = calculateEloDelta(DEFAULT_SCORE, DEFAULT_SCORE, MATCH_RESULT.LOSS);
  assert.ok(delta < 0);
});

test('calculateEloDelta is (near) zero on a draw between equally rated players', () => {
  const delta = calculateEloDelta(DEFAULT_SCORE, DEFAULT_SCORE, MATCH_RESULT.DRAW);
  assert.equal(delta, 0);
});

test('beating a much higher-rated opponent gains more than beating an equal opponent', () => {
  const deltaVsEqual = calculateEloDelta(1500, 1500, MATCH_RESULT.WIN);
  const deltaVsStronger = calculateEloDelta(1500, 1900, MATCH_RESULT.WIN);
  assert.ok(deltaVsStronger > deltaVsEqual);
});

test('losing to a much lower-rated opponent loses more than losing to an equal opponent', () => {
  const deltaVsEqual = calculateEloDelta(1500, 1500, MATCH_RESULT.LOSS);
  const deltaVsWeaker = calculateEloDelta(1500, 1100, MATCH_RESULT.LOSS);
  assert.ok(deltaVsWeaker < deltaVsEqual);
});

test('calculateEloDelta never exceeds MAX_SCORE_DELTA in magnitude, even for extreme gaps', () => {
  const winDelta = calculateEloDelta(1000, 4000, MATCH_RESULT.WIN);
  const lossDelta = calculateEloDelta(4000, 1000, MATCH_RESULT.LOSS);
  assert.ok(Math.abs(winDelta) <= MAX_SCORE_DELTA);
  assert.ok(Math.abs(lossDelta) <= MAX_SCORE_DELTA);
});

test('MAX_SCORE_DELTA equals K_FACTOR', () => {
  assert.equal(MAX_SCORE_DELTA, K_FACTOR);
});

test('getTier returns the lowest tier for a very low score', () => {
  assert.equal(getTier(0), 'ブロンズ');
});

test('getTier returns the starting tier for DEFAULT_SCORE', () => {
  assert.equal(getTier(DEFAULT_SCORE), 'ゴールド');
});

test('getTier returns the highest tier for a very high score', () => {
  assert.equal(getTier(10000), 'ダイヤモンド');
});

test('getTier is consistent at tier boundaries', () => {
  assert.equal(getTier(1299), 'ブロンズ');
  assert.equal(getTier(1300), 'シルバー');
  assert.equal(getTier(1499), 'シルバー');
  assert.equal(getTier(1500), 'ゴールド');
  assert.equal(getTier(1699), 'ゴールド');
  assert.equal(getTier(1700), 'プラチナ');
  assert.equal(getTier(1899), 'プラチナ');
  assert.equal(getTier(1900), 'ダイヤモンド');
});
