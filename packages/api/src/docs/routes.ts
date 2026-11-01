import { RequestMethod, type DynamicModule, type Type } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { generatedDocHeader } from './generated-doc-header.js';

const GENERATOR = 'packages/api/src/docs/routes.ts';
const SOURCE = 'packages/api/src/**/*.controller.ts';

type ModuleRef = Type<unknown> | DynamicModule;

const read = (key: string, target: object): unknown => Reflect.getMetadata(key, target);

/** Every controller declared by the given modules or the modules they import, transitively. */
function collectControllers(modules: readonly ModuleRef[]): Type<unknown>[] {
  const seen = new Set<unknown>();
  const controllers = new Set<Type<unknown>>();

  const visit = (ref: ModuleRef) => {
    const moduleClass = 'module' in ref ? ref.module : ref;
    if (seen.has(moduleClass)) return;
    seen.add(moduleClass);
    const fromMetadata = (key: string) => [
      ...((read(key, moduleClass) as unknown[] | undefined) ?? []),
      ...(('module' in ref ? (ref as unknown as Record<string, unknown[]>)[key] : undefined) ?? []),
    ];
    for (const controller of fromMetadata('controllers'))
      controllers.add(controller as Type<unknown>);
    for (const imported of fromMetadata('imports')) visit(imported as ModuleRef);
  };

  modules.forEach(visit);
  return [...controllers];
}

const joinPath = (...parts: string[]) =>
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
  const basePath = (read('path', controller) as string | string[] | undefined) ?? '';
  // '__guards__' is a Nest internal (the metadata key `@UseGuards` writes), not a public API.
  const classGuards = (read('__guards__', controller) as unknown[] | undefined) ?? [];

  return Object.getOwnPropertyNames(controller.prototype).flatMap((name) => {
    const handler = (controller.prototype as Record<string, unknown>)[name];
    if (typeof handler !== 'function') return [];
    const method = read('method', handler) as RequestMethod | undefined;
    if (method === undefined) return [];
    const path = (read('path', handler) as string | string[] | undefined) ?? '/';
    const guards = [
      ...classGuards,
      ...((read('__guards__', handler) as unknown[] | undefined) ?? []),
    ];
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
