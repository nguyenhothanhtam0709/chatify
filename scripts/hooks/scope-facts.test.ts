import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readScopeFile, scopeFacts } from './scope-facts.ts';

const empty = {
  ticket: null,
  packages: [],
  writes: [],
  specStatus: false,
  browserCheck: false,
  worktree: false,
};

test('reads all six facts by name', () => {
  assert.deepEqual(
    scopeFacts([
      'ticket: .scratch/00017-ticket-gates/issues/03-guard-writes.md',
      'packages: api contracts',
      'writes: .claude/settings.json docs/factory/sdlc.md',
      'spec-status: yes',
      'browser-check: yes',
      'worktree: yes',
    ]),
    {
      ticket: '.scratch/00017-ticket-gates/issues/03-guard-writes.md',
      packages: ['api', 'contracts'],
      writes: ['.claude/settings.json', 'docs/factory/sdlc.md'],
      specStatus: true,
      browserCheck: true,
      worktree: true,
    },
  );
});

test('a missing line gives the empty value', () => {
  assert.deepEqual(scopeFacts([]), empty);
  assert.deepEqual(scopeFacts(['packages: web']), { ...empty, packages: ['web'] });
});

test('none and no read as the empty value', () => {
  assert.deepEqual(
    scopeFacts(['ticket: none', 'packages: none', 'writes: none', 'spec-status: no']),
    empty,
  );
});

test('a scope file in the old glob format reads as no facts', () => {
  assert.deepEqual(
    scopeFacts(['packages/api/**', 'docs/conventions/api.md', '.scratch/*/x.md']),
    empty,
  );
});

test('readScopeFile reads facts from <common-dir>/scope/<branch>.txt, skipping comments', () => {
  const commonDir = mkdtempSync(join(tmpdir(), 'scope-facts-'));
  mkdirSync(join(commonDir, 'scope', 'agent'), { recursive: true });
  writeFileSync(join(commonDir, 'scope', 'agent', '00017-02-x.txt'), '# note\npackages: web\n\n');
  assert.deepEqual(readScopeFile(commonDir, 'agent/00017-02-x'), ['packages: web']);
  assert.equal(readScopeFile(commonDir, 'agent/missing'), null);
});
