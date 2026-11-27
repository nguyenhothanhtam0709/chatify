// Lists the Descriptive Docs a Feature Branch leaves out: the docs whose `covers:` matches a file
// changed against `origin/main` while the doc is unchanged. The Orchestrator runs it before the feature
// PR; any doc it prints means Doc Sync runs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsNotUpdated } from './covers.ts';

if (import.meta.main) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const lines = (text: string) => text.split('\n').filter(Boolean);
  const base = git('merge-base', 'origin/main', 'HEAD').trim();
  const changed = lines(git('diff', '--name-only', '--no-renames', `${base}..HEAD`));
  const docs = lines(git('ls-files', '*.md')).map((path) => ({
    path,
    content: readFileSync(join(root, path), 'utf8'),
  }));
  const missed = docsNotUpdated(changed, docs);
  if (missed.length > 0) console.log(missed.join('\n'));
}
