declare module 'pino-roll' {
  import type { DestinationStream } from 'pino';

  export interface PinoRollOptions {
    file: string;
    size?: string | number;
    frequency?: 'daily' | 'hourly' | number;
    extension?: string;
    mkdir?: boolean;
    symlink?: boolean;
    limit?: { count?: number; removeOtherLogFiles?: boolean };
    dateFormat?: string;
  }

  /** The SonicBoom stream pino-roll resolves to. */
  export interface PinoRollStream extends DestinationStream {
    flushSync(): void;
    end(): void;
  }

  export default function pinoRoll(options: PinoRollOptions): Promise<PinoRollStream>;
}
