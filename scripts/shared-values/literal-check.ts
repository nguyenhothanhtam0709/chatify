// Fails when a value contracts owns is written as a quoted string in api or web source.
// The values are read from the built contracts on every run, so a new value is checked with no edit here.
// Today's hits sit in literal-baseline.json (file + value). A hit outside it fails, and so does a
// baseline entry that no longer matches, so the baseline only shrinks.
// `node scripts/shared-values/literal-check.ts --write-baseline` rewrites the baseline from the code.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { codeOfLine, readSources, type SourceFile } from './source-files.ts';

export interface SharedValue {
  value: string;
  source: string;
}

export interface Hit extends SharedValue {
  path: string;
  line: number;
}

export const ROOTS = ['packages/api/src', 'packages/web/src'];
// shadcn components, generated and already lint-ignored; "group" there is a CSS name.
const SKIPPED = /^packages\/web\/src\/components\/ui\//;
// Lines where a contracts value is spelled for an unrelated reason, so it cannot import from contracts.
// Each exemption is a line shape, not a file, so a real re-declaration in the same file is still caught.
const EXEMPT_LINES: { pattern: RegExp; why: string }[] = [
  { pattern: /\btype="text"/, why: 'the HTML input type, not a Message kind' },
  { pattern: /readProperty\([^)]*'text'\)/, why: 'a property named text on a pg wire message' },
];

export const sharedValuesOf = (contracts: Record<string, unknown>): SharedValue[] => {
  const sets: [string, readonly unknown[]][] = [
    ['ErrorCode', Object.values(contracts['ErrorCode'] as object)],
    ['RealtimeEvent', Object.values(contracts['RealtimeEvent'] as object)],
    ['MESSAGE_KINDS', contracts['MESSAGE_KINDS'] as readonly unknown[]],
    ['CONVERSATION_KINDS', contracts['CONVERSATION_KINDS'] as readonly unknown[]],
  ];
  return sets.flatMap(([source, values]) =>
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => ({ value, source })),
  );
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const findLiterals = (files: SourceFile[], values: SharedValue[]): Hit[] => {
  const patterns = values.map((shared) => ({
    ...shared,
    quoted: new RegExp(`(['"\`])${escapeRegExp(shared.value)}\\1`),
  }));
  return files
    .filter(({ path }) => !SKIPPED.test(path))
    .flatMap(({ path, content }) =>
      content.split('\n').flatMap((line, index) => {
        const text = codeOfLine(line);
        return EXEMPT_LINES.some(({ pattern }) => pattern.test(text))
          ? []
          : patterns
              .filter(({ quoted }) => quoted.test(text))
              .map(({ value, source }) => ({ path, value, source, line: index + 1 }));
      }),
    );
};

const keyOf = ({ path, value }: { path: string; value: string }) => `${path} ${value}`;

export const baselineOf = (hits: Hit[]): string[] => [...new Set(hits.map(keyOf))].sort();

export const checkAgainstBaseline = (hits: Hit[], baseline: string[]): string[] => {
  const known = new Set(baseline);
  const found = new Set(hits.map(keyOf));
  return [
    ...hits
      .filter((hit) => !known.has(keyOf(hit)))
      .map(
        ({ path, line, value, source }) =>
          `${path}:${line}: "${value}" is a value of ${source} in contracts; import it`,
      ),
    ...baseline
      .filter((key) => !found.has(key))
      .map((key) => `literal-baseline.json: "${key}" is no longer in the code; remove it`),
  ];
};

if (import.meta.main) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const baselineFile = new URL('./literal-baseline.json', import.meta.url);
  const built = new URL('../../packages/contracts/dist/index.js', import.meta.url).href;
  const contracts = (await import(built)) as Record<string, unknown>;
  const hits = findLiterals(readSources(root, ROOTS), sharedValuesOf(contracts));
  if (process.argv.includes('--write-baseline')) {
    writeFileSync(baselineFile, `${JSON.stringify(baselineOf(hits), null, 2)}\n`);
  } else {
    const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as string[];
    const problems = checkAgainstBaseline(hits, baseline);
    if (problems.length > 0) {
      console.error(problems.join('\n'));
      process.exitCode = 1;
    }
  }
}
