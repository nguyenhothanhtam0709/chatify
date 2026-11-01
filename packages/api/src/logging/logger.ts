import pino, { type DestinationStream, type Level, type StreamEntry } from 'pino';
import pinoPretty from 'pino-pretty';
import pinoRoll from 'pino-roll';
import type { Config } from '../config/config.js';
import { getRequestContext } from './request-context.js';

/** Anything that accepts newline-delimited JSON log lines. */
export interface LogDestination {
  write(line: string): void;
}

/** Never reaches a log line, whatever code tries to log it. */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'token',
  '*.token',
  'refreshToken',
  '*.refreshToken',
  'email',
  '*.email',
  'body',
  '*.body',
];

interface FileStream extends DestinationStream {
  flushSync(): void;
  end(): void;
}

async function buildStreams(
  config: Config,
): Promise<{ streams: StreamEntry<Level>[]; file: FileStream | undefined }> {
  const streams: StreamEntry<Level>[] = [];
  let file: FileStream | undefined;
  if (config.LOG_CONSOLE_ENABLED) {
    const stream: DestinationStream =
      config.LOG_CONSOLE_FORMAT === 'pretty'
        ? pinoPretty({ colorize: true, ignore: 'pid,hostname' })
        : pino.destination(1);
    streams.push({ level: config.LOG_CONSOLE_LEVEL ?? config.LOG_LEVEL, stream });
  }
  if (config.LOG_FILE_ENABLED) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- pino-roll's types return a generic stream; it is a SonicBoom-like FileStream
    file = (await pinoRoll({
      file: config.LOG_FILE_PATH,
      size: config.LOG_FILE_MAX_SIZE,
      frequency: config.LOG_FILE_FREQUENCY,
      limit: { count: config.LOG_FILE_RETENTION },
      mkdir: true,
    })) as FileStream;
    streams.push({ level: config.LOG_FILE_LEVEL ?? config.LOG_LEVEL, stream: file });
  }
  return { streams, file };
}

export interface AppLogger {
  logger: pino.Logger;
  /** Flushes and closes the log file, if any. Safe to call once at shutdown. */
  close(): void;
}

/**
 * The one pino instance. `destination` replaces the configured transports (tests pass an
 * in-memory one). Every line carries the request ID and User ID of the current request.
 */
export async function createLogger(
  config: Config,
  destination?: LogDestination,
): Promise<AppLogger> {
  const { streams, file } = destination
    ? {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- LogDestination is a writable with the same write signature; pino only calls write
        streams: [{ level: config.LOG_LEVEL, stream: destination as DestinationStream }],
        file: undefined,
      }
    : await buildStreams(config);

  const logger = pino(
    {
      // Each stream filters by its own level; the instance must let everything through.
      level: 'trace',
      redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
      mixin: () => {
        const context = getRequestContext();
        return context ? { requestId: context.requestId, userId: context.userId } : {};
      },
    },
    pino.multistream(streams),
  );
  return {
    logger,
    close: () => {
      file?.flushSync();
      file?.end();
    },
  };
}
