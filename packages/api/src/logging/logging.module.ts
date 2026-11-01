import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { Logger } from 'pino';

export const PINO = Symbol('PINO');

/** Makes the one shared pino instance injectable (`@Inject(PINO)`). */
@Global()
@Module({})
export class LoggingModule {
  public static register(logger: Logger): DynamicModule {
    return {
      module: LoggingModule,
      providers: [{ provide: PINO, useValue: logger }],
      exports: [PINO],
    };
  }
}
