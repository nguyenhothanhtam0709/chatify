import { builtinModules } from 'node:module';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const bannedPackages = ['class-validator', 'class-transformer'];

// A later config block replaces a rule whole, so each block lists the selectors above it too.
const baseSyntax = [
  // XSS is prevented at the render sink (ADR 0002).
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML is banned: render user text as text (ADR 0002).',
  },
  {
    selector: "Property[key.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML is banned: render user text as text (ADR 0002).',
  },
];
const sourceSyntax = [
  ...baseSyntax,
  { selector: 'ExportDefaultDeclaration', message: 'Use named exports only.' },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '.scratch/**',
      '.agents/**',
      '.claude/**',
      'packages/web/src/components/ui/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Validation is Zod only (spec: one validation mechanism).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...bannedPackages.map((name) => ({
              name,
              message:
                'Use Zod schemas from @chat/contracts; class-validator/class-transformer are banned.',
            })),
            ...builtinModules
              .filter((name) => !name.startsWith('node:') && !name.startsWith('_'))
              .map((name) => ({ name, message: `Import Node built-ins as node:${name}.` })),
          ],
          patterns: bannedPackages.map((name) => ({
            group: [`${name}/*`],
            message:
              'Use Zod schemas from @chat/contracts; class-validator/class-transformer are banned.',
          })),
        },
      ],
      'no-restricted-syntax': ['error', ...baseSyntax],
    },
  },
  // Nest modules are empty decorated classes.
  {
    rules: {
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'packages/web/src/test/**', 'packages/api/test/**'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    ignores: ['**/*.d.ts'],
    rules: { 'no-restricted-syntax': ['error', ...sourceSyntax] },
  },
  {
    files: ['packages/api/src/**/*.ts'],
    ignores: ['**/*.d.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...sourceSyntax,
        {
          selector: "ImportSpecifier[imported.name='forwardRef']",
          message: 'No forwardRef: give a shared leaf its own module.',
        },
      ],
    },
  },
  {
    files: ['packages/api/src/**/*.ts'],
    ignores: ['packages/api/src/**/*-cli.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    files: ['packages/api/src/**/*.ts'],
    ignores: ['packages/api/src/main.ts', 'packages/api/src/**/*-cli.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read config through loadConfig or ConfigService.',
        },
      ],
    },
  },
);
