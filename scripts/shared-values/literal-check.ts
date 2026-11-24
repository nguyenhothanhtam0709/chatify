// Fails when a value contracts owns is written as a quoted string in api or web source.
// The values are read from the built contracts on every run, so a new value is checked with no edit here.
import { fileURLToPath } from 'node:url';
import { readSources, type SourceFile } from './source-files.ts';

export interface SharedValue {
  value: string;
  source: string;
}

export const ROOTS = ['packages/api/src', 'packages/web/src'];

export const sharedValuesOf = (contracts: Record<string, unknown>): SharedValue[] => {
  const sets: [string, readonly unknown[]][] = [
    ['ErrorCode', Object.values(contracts.ErrorCode as object)],
    ['RealtimeEvent', Object.values(contracts.RealtimeEvent as object)],
    ['MESSAGE_KINDS', contracts.MESSAGE_KINDS as readonly unknown[]],
    ['CONVERSATION_KINDS', contracts.CONVERSATION_KINDS as readonly unknown[]],
  ];
  return sets.flatMap(([source, values]) =>
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => ({ value, source })),
  );
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const findLiterals = (files: SourceFile[], values: SharedValue[]): string[] => {
  const patterns = values.map((shared) => ({
    ...shared,
    quoted: new RegExp(`(['"\`])${escapeRegExp(shared.value)}\\1`),
  }));
  return files.flatMap(({ path, content }) =>
    content.split('\n').flatMap((line, index) =>
      patterns
        .filter(({ quoted }) => quoted.test(line))
        .map(
          ({ value, source }) =>
            `${path}:${index + 1}: "${value}" is a value of ${source} in contracts; import it`,
        ),
    ),
  );
};

if (import.meta.main) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const built = new URL('../../packages/contracts/dist/index.js', import.meta.url).href;
  const contracts = (await import(built)) as Record<string, unknown>;
  const problems = findLiterals(readSources(root, ROOTS), sharedValuesOf(contracts));
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}
