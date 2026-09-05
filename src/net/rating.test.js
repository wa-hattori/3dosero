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
  getTierInfo,
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
  assert.equal(getTier(0), 'アイアン');
});

test('getTier returns the starting tier for DEFAULT_SCORE', () => {
  assert.equal(getTier(DEFAULT_SCORE), 'アイアン');
});

test('getTier returns the highest tier for a very high score', () => {
  assert.equal(getTier(10000), 'カーボンナノチューブ');
});

test('getTier is consistent at tier boundaries', () => {
  assert.equal(getTier(1599), 'アイアン');
  assert.equal(getTier(1600), 'アルミ');
  assert.equal(getTier(1699), 'アルミ');
  assert.equal(getTier(1700), 'ブロンズ');
  assert.equal(getTier(1799), 'ブロンズ');
  assert.equal(getTier(1800), 'シルバー');
  assert.equal(getTier(1999), 'シルバー');
  assert.equal(getTier(2000), 'ダイヤ');
  assert.equal(getTier(2999), 'ダイヤ');
  assert.equal(getTier(3000), 'カーボンナノチューブ');
});

test('getTierInfo returns the icon id and element symbol alongside the label', () => {
  assert.deepEqual(getTierInfo(DEFAULT_SCORE), {
    threshold: 1600,
    id: 'iron',
    label: 'アイアン',
    symbol: 'Fe',
  });
  assert.equal(getTierInfo(1650).id, 'aluminum');
  assert.equal(getTierInfo(1750).symbol, 'Cu');
  assert.equal(getTierInfo(1850).symbol, 'Ag');
  assert.equal(getTierInfo(2500).symbol, 'C');
  assert.equal(getTierInfo(5000).id, 'carbon-nanotube');
});
