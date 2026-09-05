import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFallbackCpuLevel, getFallbackCpuNotionalRating } from './matchmaking-cpu-fallback.js';

test('getFallbackCpuLevel maps the starting tier (iron) to CPU level 1', () => {
  assert.equal(getFallbackCpuLevel(1500), 1);
});

test('getFallbackCpuLevel maps aluminum to CPU level 2', () => {
  assert.equal(getFallbackCpuLevel(1650), 2);
});

test('getFallbackCpuLevel maps bronze to CPU level 3', () => {
  assert.equal(getFallbackCpuLevel(1750), 3);
});

test('getFallbackCpuLevel maps silver to CPU level 4', () => {
  assert.equal(getFallbackCpuLevel(1900), 4);
});

test('getFallbackCpuLevel maps diamond to CPU level 5', () => {
  assert.equal(getFallbackCpuLevel(2500), 5);
});

test('getFallbackCpuLevel maps carbon nanotube to CPU level 5 (shares the top level with diamond)', () => {
  assert.equal(getFallbackCpuLevel(5000), 5);
});

test('getFallbackCpuLevel is consistent at tier boundaries', () => {
  assert.equal(getFallbackCpuLevel(1599), 1);
  assert.equal(getFallbackCpuLevel(1600), 2);
  assert.equal(getFallbackCpuLevel(1699), 2);
  assert.equal(getFallbackCpuLevel(1700), 3);
});

test('getFallbackCpuNotionalRating returns the corresponding tier lower bound for each level', () => {
  assert.equal(getFallbackCpuNotionalRating(1), 1500);
  assert.equal(getFallbackCpuNotionalRating(2), 1600);
  assert.equal(getFallbackCpuNotionalRating(3), 1700);
  assert.equal(getFallbackCpuNotionalRating(4), 1800);
  assert.equal(getFallbackCpuNotionalRating(5), 2000);
});
