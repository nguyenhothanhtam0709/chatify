import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findSpelledLimits } from './ui-number-check.ts';

const file = (content: string) => ({ path: 'packages/web/src/a.tsx', content });

test('a string built from contracts constants passes', () => {
  assert.deepEqual(findSpelledLimits([file('`${NICKNAME_MIN}-${NICKNAME_MAX} characters`')]), []);
});

test('a range of characters is reported with its location', () => {
  assert.deepEqual(findSpelledLimits([file('x\nconst m = "Use 1-50 characters";')]), [
    'packages/web/src/a.tsx:2: a limit is spelled out as a number; build it from contracts',
  ]);
});

test('"at most <n>" is reported', () => {
  assert.equal(findSpelledLimits([file('"A Group has at most 256 Members"')]).length, 1);
});

test('"at least <n>" is not one of the patterns', () => {
  assert.deepEqual(findSpelledLimits([file('"Type at least 2 characters"')]), []);
});
