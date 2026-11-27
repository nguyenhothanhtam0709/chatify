import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPreflight, type PreflightEnv } from './preflight.ts';

const specPath = '.scratch/00017-ticket-gates/spec.md';
const ticketPath = '.scratch/00017-ticket-gates/issues/06-preflight.md';
const ticket = (blockedBy: string) =>
  `# 06\n\n**Blocked by:** ${blockedBy}\n\n**Status:** ready-for-agent\n`;

const good: PreflightEnv = {
  nodeVersion: '26.13.1',
  enginesRange: '>=26',
  branch: 'agent/00017-06-preflight',
  featureBranches: ['feat/00017-ticket-gates', 'feat/00016-agent-roles'],
  featureTipMerged: true,
  trackedChanges: [],
  untracked: [],
  dockerRunning: true,
  scope: {
    ticket: ticketPath,
    packages: ['scripts'],
    writes: [],
    specStatus: false,
    browserCheck: false,
    worktree: true,
  },
  tipFiles: {
    [specPath]: '# Spec\n\nStatus: ready-for-agent\n',
    [ticketPath]: ticket('02'),
    '.scratch/00017-ticket-gates/issues/02-scope.md': '**Status:** resolved\n',
  },
};

const failures = (env: Partial<PreflightEnv>) => checkPreflight({ ...good, ...env });

test('a clean, up-to-date Task Branch passes', () => {
  assert.deepEqual(failures({}), []);
});

test('Node below the engines range fails and says to run nvm use', () => {
  const [one, ...rest] = failures({ nodeVersion: '24.1.0' });
  assert.equal(rest.length, 0);
  assert.match(one ?? '', /Node 24\.1\.0.*>=26.*nvm use/s);
});

test('an engines range it cannot read fails closed', () => {
  assert.equal(failures({ enginesRange: '^26 || ^28' }).length, 1);
});

test('a branch that is not a Task Branch fails', () => {
  assert.equal(failures({ branch: 'feat/00017-ticket-gates' }).length >= 1, true);
  assert.match(failures({ branch: 'main' }).join('\n'), /agent\/NNNNN-NN-<slug>/);
});

test('the Doc Sync branch name passes', () => {
  assert.deepEqual(
    failures({ branch: 'agent/00017-doc-sync', scope: { ...good.scope!, ticket: null } }),
    [],
  );
});

test('the Doc Writer branch name passes and a longer name fails', () => {
  const scope = { ...good.scope!, ticket: null };
  assert.deepEqual(failures({ branch: 'agent/00017-doc-writer', scope }), []);
  const bad = failures({ branch: 'agent/00017-doc-writers', scope }).join('\n');
  assert.match(bad, /agent\/NNNNN-doc-writer/);
});

test('no Feature Branch on origin fails', () => {
  assert.match(
    failures({ featureBranches: ['feat/00016-agent-roles'] }).join('\n'),
    /feat\/00017-\*/,
  );
});

test('a Feature Branch tip not merged into the branch fails and says to merge it', () => {
  assert.match(
    failures({ featureTipMerged: false }).join('\n'),
    /merge origin\/feat\/00017-ticket-gates/,
  );
});

test('a modified or staged tracked file fails', () => {
  assert.match(failures({ trackedChanges: [' M pnpm-lock.yaml'] }).join('\n'), /pnpm-lock\.yaml/);
});

test('untracked files are listed and the Implementer is told to escalate to the human', () => {
  const text = failures({ untracked: ['overview.md'] }).join('\n');
  assert.match(text, /overview\.md/);
  assert.match(text, /[Ee]scalate.*human/s);
});

test('Docker not running fails and says to start it', () => {
  assert.match(failures({ dockerRunning: false }).join('\n'), /Docker.*start/is);
});

test('a Spec still needs-triage on the tip fails: the Spec PR is not merged', () => {
  const tipFiles = { ...good.tipFiles, [specPath]: 'Status: needs-triage\n' };
  assert.match(failures({ tipFiles }).join('\n'), /Spec PR/);
});

test('a resolved Spec passes', () => {
  const tipFiles = { ...good.tipFiles, [specPath]: 'Status: resolved\n' };
  assert.deepEqual(failures({ tipFiles }), []);
});

test('a Ticket missing on the tip fails', () => {
  const { [ticketPath]: _gone, ...tipFiles } = good.tipFiles;
  assert.match(failures({ tipFiles }).join('\n'), /06-preflight\.md.*not on/s);
});

test('a blocker that is not resolved fails and names it', () => {
  const tipFiles = {
    ...good.tipFiles,
    '.scratch/00017-ticket-gates/issues/02-scope.md': '**Status:** ready-for-agent\n',
  };
  assert.match(failures({ tipFiles }).join('\n'), /02/);
});

test('a blocker missing on the tip fails', () => {
  const { '.scratch/00017-ticket-gates/issues/02-scope.md': _gone, ...tipFiles } = good.tipFiles;
  assert.match(failures({ tipFiles }).join('\n'), /02/);
});

test('Blocked by None passes', () => {
  assert.deepEqual(failures({ tipFiles: { ...good.tipFiles, [ticketPath]: ticket('None') } }), []);
});

test('ticket none skips the Blocked by check', () => {
  const tipFiles = { [specPath]: good.tipFiles[specPath]! };
  assert.deepEqual(
    failures({ branch: 'agent/00017-doc-sync', scope: { ...good.scope!, ticket: null }, tipFiles }),
    [],
  );
});

test('a missing scope file fails and says to ask the Orchestrator', () => {
  assert.match(failures({ scope: null }).join('\n'), /scope file/);
});
