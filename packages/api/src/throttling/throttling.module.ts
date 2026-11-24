import { Module, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  ThrottlerModule,
  type ThrottlerModuleOptions,
  type ThrottlerOptions,
} from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { readProperty } from '../common/read-property.js';
import type { Config } from '../config/config.js';
import { ONE_MINUTE_MS } from '../common/time.js';
import { AppThrottlerGuard } from './app-throttler.guard.js';

// Windows of 10 s, 2 s and 15 min.
const SEND_TTL_MS = 10_000;
const TYPING_TTL_MS = 2000;
const LOGIN_IDENTIFIER_TTL_MS = 900_000;
const SEARCH_URL = '/api/v1/users/search';
const SEND_URLS = ['/api/v1/direct-messages', '/api/v1/conversations/:id/messages'];
const TYPING_URL = '/api/v1/conversations/:id/typing';
const isTypingRoute = (req: FastifyRequest): boolean =>
  req.method === 'POST' && req.routeOptions?.url === TYPING_URL;
const isSendRoute = (req: FastifyRequest): boolean =>
  req.method === 'POST' && SEND_URLS.includes(req.routeOptions?.url ?? '');

/** `AuthGuard` sets `request.auth`; the global throttler guard runs before it. */
const authenticatedUserId = (req: unknown): unknown =>
  readProperty(readProperty(req, 'auth'), 'userId');
const isAuthenticated = (req: unknown): boolean => authenticatedUserId(req) !== undefined;

const request = (context: ExecutionContext): FastifyRequest =>
  context.switchToHttp().getRequest<FastifyRequest>();
// Adapts a predicate on the request to the `skipIf` the throttler takes.
const skipWhen =
  (shouldSkip: (req: FastifyRequest) => boolean) =>
  (context: ExecutionContext): boolean =>
    shouldSkip(request(context));
const userTracker = (req: unknown): string => `user:${String(authenticatedUserId(req))}`;

const genericThrottler = (config: ConfigService<Config, true>): ThrottlerOptions => ({
  limit: config.get('THROTTLE_LIMIT', { infer: true }),
  ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
  // Route-level guards run after authentication; the global guard has already
  // counted the request by then.
  // Typing signals have their own limit and do not count against this one.
  skipIf: skipWhen((req) => isAuthenticated(req) || isTypingRoute(req)),
});

// User search only: 30 per minute per User, counted by the route-level guard
// once the caller is authenticated.
const searchThrottler: ThrottlerOptions = {
  name: 'search',
  limit: 30,
  ttl: ONE_MINUTE_MS,
  skipIf: skipWhen((req) => !isAuthenticated(req) || req.routeOptions?.url !== SEARCH_URL),
  getTracker: userTracker,
};

// Message sends only (direct and to a Conversation): 30 per 10 s per User.
const sendThrottler: ThrottlerOptions = {
  name: 'send',
  limit: 30,
  ttl: SEND_TTL_MS,
  skipIf: skipWhen((req) => !isAuthenticated(req) || !isSendRoute(req)),
  getTracker: userTracker,
};

// Typing Indicator signals only: 2 per 2 s per User and Conversation (a refresh plus
// a `stopped`).
const typingThrottler: ThrottlerOptions = {
  name: 'typing',
  limit: 2,
  ttl: TYPING_TTL_MS,
  skipIf: skipWhen((req) => !isAuthenticated(req) || !isTypingRoute(req)),
  getTracker: (req): string =>
    `${userTracker(req)}:${String(readProperty(readProperty(req, 'params'), 'id')).toLowerCase()}`,
};

// Typing route only, before authentication: per IP, so bad tokens and random IDs are
// limited too. Its own counter; the generic limit does not count typing.
const typingIpThrottler = (config: ConfigService<Config, true>): ThrottlerOptions => ({
  name: 'typingIp',
  limit: config.get('THROTTLE_LIMIT', { infer: true }),
  ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
  skipIf: skipWhen((req) => isAuthenticated(req) || !isTypingRoute(req)),
});

// Login only: 5 attempts per 15 minutes per identifier (the per-IP limit is on
// the route itself).
const identifierThrottler: ThrottlerOptions = {
  name: 'identifier',
  limit: 5,
  ttl: LOGIN_IDENTIFIER_TTL_MS,
  skipIf: (context): boolean => request(context).routeOptions?.url !== '/api/v1/auth/login',
  getTracker: (req): string => {
    const identifier = readProperty(readProperty(req, 'body'), 'identifier');
    return typeof identifier === 'string'
      ? `identifier:${identifier.normalize('NFC').toLowerCase()}`
      : `ip:${String(req['ip'])}`;
  },
};

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Config, true>): ThrottlerModuleOptions => ({
        throttlers: [
          genericThrottler(config),
          searchThrottler,
          sendThrottler,
          typingThrottler,
          typingIpThrottler(config),
          identifierThrottler,
        ],
      }),
    }),
  ],
  // Rate limit every route by default.
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class ThrottlingModule {}
