// Which api and web files the shared-value checks read. Tracked files only, tests and helpers excluded.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SourceFile {
  path: string;
  content: string;
}

const TEST_FILE = /\.(test|contract)\.[cm]?[jt]sx?$|\/(test|__tests__)\//;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

export const isSource = (path: string, roots: string[]): boolean =>
  roots.some((root) => path.startsWith(`${root}/`)) &&
  SOURCE_FILE.test(path) &&
  !TEST_FILE.test(path);

export const readSources = (root: string, roots: string[]): SourceFile[] =>
  execFileSync('git', ['ls-files', ...roots], { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((path) => isSource(path, roots))
    .map((path) => ({ path, content: readFileSync(join(root, path), 'utf8') }));
