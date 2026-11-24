import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import { roundMs } from '../common/time.js';
import { runWithRequestContext, type RequestContext } from './request-context.js';

/**
 * Attaches the request context (request ID, later User ID) to the whole request lifecycle
 * and logs exactly one line per request when the response is sent. Never logs bodies or headers.
 */
export function installHttpLogging(fastify: FastifyInstance, logger: Logger): void {
  const contexts = new WeakMap<FastifyRequest, RequestContext>();

  fastify.addHook('onRequest', (request, reply, done) => {
    const context: RequestContext = { requestId: request.id };
    contexts.set(request, context);
    void reply.header('x-request-id', request.id);
    runWithRequestContext(context, () => done());
  });

  fastify.addHook('onResponse', (request, reply, done) => {
    const context = contexts.get(request);
    const log = (): void =>
      logger.info(
        {
          method: request.method,
          route: request.routeOptions?.url,
          status: reply.statusCode,
          durationMs: roundMs(reply.elapsedTime),
          ip: request.ip,
        },
        'request completed',
      );
    if (context) runWithRequestContext(context, log);
    else log();
    done();
  });
}
