import { RequestMethod, type DynamicModule, type Type } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { generatedDocHeader } from './generated-doc-header.js';

const GENERATOR = 'packages/api/src/docs/routes.ts';
const SOURCE = 'packages/api/src/**/*.controller.ts';

type ModuleRef = Type<unknown> | DynamicModule;

/** `Reflect.getMetadata` returns `any`; the caller names the shape Nest's decorators write. */
const read = <T>(key: string, target: object): T | undefined => Reflect.getMetadata(key, target);

const isModuleRef = (value: unknown): value is ModuleRef =>
  typeof value === 'function' || (typeof value === 'object' && value !== null && 'module' in value);

const requireModuleRef = (value: unknown): ModuleRef => {
  if (!isModuleRef(value)) {
    throw new Error(
      'The route generator cannot follow an import that is not a module class or a dynamic module',
    );
  }
  return value;
};

/** What one module declares: its controllers and the modules it imports. */
function declaredBy(ref: ModuleRef): { controllers: Type<unknown>[]; imports: ModuleRef[] } {
  const moduleClass = 'module' in ref ? ref.module : ref;
  // A dynamic module's `imports` may also hold promises and forward references, which the
  // generator does not follow; fail loudly rather than skip a module's controllers.
  const dynamicImports = 'module' in ref ? (ref.imports ?? []).map(requireModuleRef) : [];
  return {
    controllers: [
      ...(read<Type<unknown>[]>('controllers', moduleClass) ?? []),
      ...('module' in ref ? (ref.controllers ?? []) : []),
    ],
    imports: [...(read<ModuleRef[]>('imports', moduleClass) ?? []), ...dynamicImports],
  };
}

/** Every controller declared by the given modules or the modules they import, transitively. */
function collectControllers(modules: readonly ModuleRef[]): Type<unknown>[] {
  const seen = new Set<unknown>();
  const controllers = new Set<Type<unknown>>();

  const visit = (ref: ModuleRef): void => {
    const moduleClass = 'module' in ref ? ref.module : ref;
    if (seen.has(moduleClass)) return;
    seen.add(moduleClass);
    const declared = declaredBy(ref);
    for (const controller of declared.controllers) controllers.add(controller);
    declared.imports.forEach(visit);
  };

  modules.forEach(visit);
  return [...controllers];
}

const joinPath = (...parts: string[]): string =>
  '/' +
  parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/');

interface Route {
  method: string;
  path: string;
  auth: boolean;
  handler: string;
}

function routesOf(controller: Type<unknown>, globalPrefix: string): Route[] {
  const basePath = read<string | string[]>('path', controller) ?? '';
  // '__guards__' is a Nest internal (the metadata key `@UseGuards` writes), not a public API.
  const classGuards = read<unknown[]>('__guards__', controller) ?? [];

  return Object.getOwnPropertyNames(controller.prototype).flatMap((name) => {
    const handler = Reflect.get(controller.prototype, name);
    if (typeof handler !== 'function') return [];
    const method = read<RequestMethod>('method', handler);
    if (method === undefined) return [];
    const path = read<string | string[]>('path', handler) ?? '/';
    const guards = [...classGuards, ...(read<unknown[]>('__guards__', handler) ?? [])];
    const methodName = RequestMethod[method];
    if (methodName === undefined) {
      throw new Error(`Unknown request method ${method} on ${controller.name}.${name}`);
    }
    return [
      {
        method: methodName,
        path: joinPath(globalPrefix, [basePath].flat()[0] ?? '', [path].flat()[0] ?? ''),
        auth: guards.includes(AuthGuard),
        handler: `${controller.name}.${name}`,
      },
    ];
  });
}

/**
 * Markdown table of the HTTP routes, read from the controllers' route metadata. Nothing is
 * instantiated, so neither the app nor a database is needed.
 */
export function renderRoutes(
  modules: readonly ModuleRef[],
  options: { globalPrefix: string },
): string {
  const routes = collectControllers(modules)
    .flatMap((controller) => routesOf(controller, options.globalPrefix))
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  return [
    ...generatedDocHeader({ generator: GENERATOR, source: SOURCE, title: 'HTTP routes' }),
    '"Auth" means the route requires a signed-in User (`AuthGuard`).',
    '',
    '| Method | Path | Auth | Handler |',
    '| --- | --- | --- | --- |',
    ...routes.map(
      (r) => `| ${r.method} | \`${r.path}\` | ${r.auth ? 'yes' : 'no'} | \`${r.handler}\` |`,
    ),
    '',
  ].join('\n');
}
