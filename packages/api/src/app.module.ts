import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { Logger } from 'pino';
import type { Clock } from './clock/clock.js';
import { ThrottlingModule } from './throttling/throttling.module.js';
import { ClockModule } from './clock/clock.module.js';
import { ErrorsModule } from './common/errors.module.js';
import { loadConfig } from './config/config.js';
import { DatabaseModule } from './db/database.module.js';
import { FEATURE_MODULES } from './feature-modules.js';
import { LoggingModule } from './logging/logging.module.js';

@Module({})
export class AppModule {
  public static register(
    rawConfig: Record<string, unknown>,
    clock: Clock,
    logger: Logger,
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          // Configuration is passed in explicitly (main.ts hands it process.env), so the
          // validate hook ignores what @nestjs/config collected and parses `rawConfig`.
          validate: () => loadConfig(rawConfig),
        }),
        ThrottlingModule,
        LoggingModule.register(logger),
        DatabaseModule,
        ErrorsModule,
        ClockModule.register(clock),
        ...FEATURE_MODULES,
      ],
    };
  }
}
