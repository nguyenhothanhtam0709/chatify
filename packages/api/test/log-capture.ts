import type { LogDestination } from '../src/logging/logger.js';

export interface LogLine {
  level: number;
  msg?: string;
  [key: string]: unknown;
}

/** pino numeric levels. */
export const LEVEL = { debug: 20, info: 30, warn: 40, error: 50 } as const;

/** In-memory log destination so tests can assert on exactly what was logged. */
export class LogCapture implements LogDestination {
  private readonly chunks: string[] = [];

  public write(line: string): void {
    this.chunks.push(line);
  }

  public get lines(): LogLine[] {
    return this.chunks
      .join('')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l) as LogLine);
  }

  /** The raw captured text, for asserting that a secret appears nowhere. */
  public get raw(): string {
    return this.chunks.join('');
  }
}
