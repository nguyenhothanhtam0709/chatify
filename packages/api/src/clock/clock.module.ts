import { Global, Module, type DynamicModule } from '@nestjs/common';
import { CLOCK, type Clock } from './clock.js';

@Global()
@Module({})
export class ClockModule {
  public static register(clock: Clock): DynamicModule {
    return {
      module: ClockModule,
      providers: [{ provide: CLOCK, useValue: clock }],
      exports: [CLOCK],
    };
  }
}
