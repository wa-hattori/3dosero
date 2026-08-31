import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AD_INTERSTITIAL_FREQUENCY, shouldShowInterstitial } from './ad-frequency.js';

test('shouldShowInterstitial is false before the first game completes', () => {
  assert.equal(shouldShowInterstitial(0), false);
});

test('shouldShowInterstitial is false for games that are not a multiple of the frequency', () => {
  for (let i = 1; i < AD_INTERSTITIAL_FREQUENCY; i += 1) {
    assert.equal(shouldShowInterstitial(i), false);
  }
});

test('shouldShowInterstitial is true exactly at the default frequency', () => {
  assert.equal(shouldShowInterstitial(AD_INTERSTITIAL_FREQUENCY), true);
});

test('shouldShowInterstitial is true at every subsequent multiple of the frequency', () => {
  assert.equal(shouldShowInterstitial(AD_INTERSTITIAL_FREQUENCY * 2), true);
  assert.equal(shouldShowInterstitial(AD_INTERSTITIAL_FREQUENCY * 5), true);
});

test('shouldShowInterstitial respects a custom frequency', () => {
  assert.equal(shouldShowInterstitial(2, 2), true);
  assert.equal(shouldShowInterstitial(3, 2), false);
  assert.equal(shouldShowInterstitial(4, 2), true);
});

test('shouldShowInterstitial never fires when frequency is not a positive divisor match', () => {
  assert.equal(shouldShowInterstitial(1, AD_INTERSTITIAL_FREQUENCY), false);
});
