import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { gitContext, gitContextOfPath, worktreeOf } from './git-context.ts';
import { worktreeFixture } from './worktree-fixture.ts';

test('a directory resolves to its own checkout root, the shared git dir and its branch', () => {
  const repo = worktreeFixture();
  assert.deepEqual(gitContext(join(repo.worktree, 'scripts')), {
    root: repo.worktree,
    commonDir: join(repo.main, '.git'),
    branch: repo.branch,
  });
  assert.deepEqual(gitContext(repo.main), {
    root: repo.main,
    commonDir: join(repo.main, '.git'),
    branch: 'feat/00007-x',
  });
});

test('a directory outside any repo resolves to null', () => {
  assert.equal(gitContext('/nonexistent/dir'), null);
});

test('a file not yet created resolves from its nearest existing parent', () => {
  const repo = worktreeFixture();
  const context = gitContextOfPath(join(repo.worktree, 'scripts/new/deep/b.ts'), repo.main);
  assert.equal(context?.branch, repo.branch);
});

test('a relative path resolves against the cwd', () => {
  const repo = worktreeFixture();
  assert.equal(gitContextOfPath('scripts/a.ts', repo.main)?.branch, 'feat/00007-x');
  assert.equal(gitContextOfPath('scripts/a.ts', repo.worktree)?.branch, repo.branch);
});

test('the worktree of a branch is the one checked out on it, else the main checkout', () => {
  const repo = worktreeFixture();
  assert.equal(worktreeOf(repo.main, repo.branch), repo.worktree);
  assert.equal(worktreeOf(repo.worktree, 'feat/00007-x'), repo.main);
  repo.git(['branch', 'agent/00007-02-z'], repo.main);
  assert.equal(worktreeOf(repo.worktree, 'agent/00007-02-z'), repo.main);
});
