import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodeVersionWarning } from './node-version.ts';

test('a Node below engines gives a warning that says what fails and what to do', () => {
  const warning = nodeVersionWarning('24.1.0', '>=26');
  assert.match(warning ?? '', /pnpm/);
  assert.match(warning ?? '', /stop check/);
  assert.match(warning ?? '', /PR guard/);
  assert.match(warning ?? '', /nvm use/);
});

test('a Node that satisfies engines gives nothing', () => {
  assert.equal(nodeVersionWarning('26.0.0', '>=26'), null);
  assert.equal(nodeVersionWarning('26.13.1', '>=26'), null);
});

test('a range it cannot read gives nothing', () => {
  assert.equal(nodeVersionWarning('24.0.0', '^26'), null);
  assert.equal(nodeVersionWarning('24.0.0', ''), null);
});
