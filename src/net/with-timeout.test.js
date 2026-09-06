import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from './with-timeout.js';

test('withTimeout resolves with the original value when the promise settles before the timeout', async () => {
  const result = await withTimeout(Promise.resolve('ok'), 1000, 'timed out');
  assert.equal(result, 'ok');
});

test('withTimeout rejects with the original error when the promise rejects before the timeout', async () => {
  await assert.rejects(
    withTimeout(Promise.reject(new Error('original failure')), 1000, 'timed out'),
    /original failure/,
  );
});

test('withTimeout rejects with the timeout message when the promise never settles in time', async () => {
  const neverSettles = new Promise(() => {});
  await assert.rejects(withTimeout(neverSettles, 10, 'took too long'), /took too long/);
});
