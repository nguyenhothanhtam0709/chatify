import type { LoggerService } from '@nestjs/common';
import type { Logger } from 'pino';

type Method = 'info' | 'error' | 'warn' | 'debug' | 'trace' | 'fatal';

/** Nest's `LoggerService` on top of the shared pino instance. */
export class PinoLoggerService implements LoggerService {
  constructor(private readonly logger: Logger) {}

  public log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  public error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  public warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  public debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  public verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  public fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  /** Nest passes the context name as the last string argument; `error` may precede it with a stack. */
  private write(method: Method, message: unknown, params: unknown[]): void {
    const last = params.at(-1);
    const context = typeof last === 'string' ? last : undefined;
    const rest = context === undefined ? params : params.slice(0, -1);
    const stack = method === 'error' && typeof rest[0] === 'string' ? rest[0] : undefined;
    const text =
      typeof message === 'string'
        ? message
        : message instanceof Error
          ? message.message
          : JSON.stringify(message);
    this.logger[method]({ ...(context ? { context } : {}), ...(stack ? { stack } : {}) }, text);
  }
}
