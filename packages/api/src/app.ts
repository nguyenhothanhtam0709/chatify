import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { systemClock, type Clock } from './clock/clock.js';
import { loadConfig } from './config/config.js';
import { installHttpLogging } from './logging/http-logging.js';
import { createLogger, type LogDestination } from './logging/logger.js';
import { PinoLoggerService } from './logging/pino-logger.service.js';
import { RealtimeIoAdapter } from './realtime/realtime.adapter.js';

/** Prefix of every HTTP route. */
export const API_PREFIX = 'api/v1';

/** The only things app tests may swap out (see the spec's test-time overrides). */
export interface AppOverrides {
  clock?: Clock;
  /** Replaces the configured log transports, e.g. with an in-memory destination. */
  logDestination?: LogDestination;
}

async function registerSecurityPlugins(
  app: NestFastifyApplication,
  spaOrigin: string,
): Promise<void> {
  // The API serves JSON only, so the CSP forbids loading or framing anything.
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  // A function (not a string) so other origins get no CORS headers at all, rather than the
  // SPA origin echoed back.
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) =>
      callback(null, origin === spaOrigin),
    credentials: true,
  });
  await app.register(cookie);
}

export async function createApp(
  rawConfig: Record<string, unknown>,
  overrides: AppOverrides = {},
): Promise<NestFastifyApplication> {
  // Fail fast on invalid configuration, before anything is opened.
  const config = loadConfig(rawConfig);
  const { logger, close: closeLogger } = await createLogger(config, overrides.logDestination);

  const adapter = new FastifyAdapter({
    loggerInstance: logger,
    genReqId: (): string => randomUUID(),
    // We emit our own single, body-free line per request (see installHttpLogging).
    disableRequestLogging: true,
  });
  installHttpLogging(adapter.getInstance(), logger);

  let app: NestFastifyApplication;
  try {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule.register(rawConfig, overrides.clock ?? systemClock, logger),
      adapter,
      // Boot logs are buffered until PinoLoggerService is installed below.
      // abortOnError: throw on boot failure instead of Nest's default process.abort().
      { bufferLogs: true, abortOnError: false },
    );
  } catch (error) {
    closeLogger();
    throw error;
  }
  app.useLogger(new PinoLoggerService(logger));
  app.useWebSocketAdapter(new RealtimeIoAdapter(app));
  app.setGlobalPrefix(API_PREFIX);
  await registerSecurityPlugins(app, config.SPA_ORIGIN);
  adapter.getInstance().addHook('onClose', (_instance, done) => {
    closeLogger();
    done();
  });
  return app;
}
