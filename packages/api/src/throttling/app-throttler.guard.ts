import { Inject, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import type { Config } from '../config/config.js';

/**
 * Named throttlers get a suffixed header (`Retry-After-identifier`); clients only know the
 * plain `Retry-After`, so every 429 carries that one too.
 */
export class AppThrottlerGuard extends ThrottlerGuard {
  @Inject(ConfigService)
  private readonly appConfig!: ConfigService<Config, true>;

  /** `THROTTLE_DISABLED` turns off every throttler (global, per-route and named). */
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return this.appConfig.get('THROTTLE_DISABLED', { infer: true }) || super.shouldSkip(context);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    void reply.header('Retry-After', String(detail.timeToBlockExpire));
    return super.throwThrottlingException(context, detail);
  }
}

/**
 * Route-level guard that runs after `AuthGuard`, so the `search` throttler can be keyed by
 * User (the global guard runs before authentication and only sees the IP).
 */
export class SearchThrottlerGuard extends AppThrottlerGuard {}

/**
 * Same, for Message sends (`send` throttler). The counter is per User, shared by every send
 * route (the default key would also include the handler, giving each route its own budget).
 */
export class SendThrottlerGuard extends AppThrottlerGuard {
  protected override generateKey(
    _context: ExecutionContext,
    tracker: string,
    throttlerName: string,
  ): string {
    return `${throttlerName}-${tracker}`;
  }
}

/**
 * Same, for Typing Indicator signals (`typing` throttler). The counter is per User and
 * Conversation, from the tracker; the generic limit does not count these requests.
 */
export class TypingThrottlerGuard extends AppThrottlerGuard {}
