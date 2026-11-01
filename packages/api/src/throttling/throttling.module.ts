import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { readProperty } from '../common/read-property.js';
import type { Config } from '../config/config.js';
import { AppThrottlerGuard } from './app-throttler.guard.js';

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

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Config, true>) => ({
        throttlers: [
          {
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
            ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
            // Route-level guards run after authentication; the global guard has already
            // counted the request by then.
            // Typing signals have their own limit and do not count against this one.
            skipIf: (context) => {
              const req = context.switchToHttp().getRequest<FastifyRequest>();
              return isAuthenticated(req) || isTypingRoute(req);
            },
          },
          // User search only: 30 per minute per User, counted by the route-level guard
          // once the caller is authenticated.
          {
            name: 'search',
            limit: 30,
            ttl: 60 * 1000,
            skipIf: (context) => {
              const req = context.switchToHttp().getRequest<FastifyRequest>();
              return !isAuthenticated(req) || req.routeOptions?.url !== SEARCH_URL;
            },
            getTracker: (req) => `user:${String(authenticatedUserId(req))}`,
          },
          // Message sends only (direct and to a Conversation): 30 per 10 s per User.
          {
            name: 'send',
            limit: 30,
            ttl: 10 * 1000,
            skipIf: (context) => {
              const req = context.switchToHttp().getRequest<FastifyRequest>();
              return !isAuthenticated(req) || !isSendRoute(req);
            },
            getTracker: (req) => `user:${String(authenticatedUserId(req))}`,
          },
          // Typing Indicator signals only: 2 per 2 s per User and Conversation (a refresh plus
          // a `stopped`).
          {
            name: 'typing',
            limit: 2,
            ttl: 2 * 1000,
            skipIf: (context) => {
              const req = context.switchToHttp().getRequest<FastifyRequest>();
              return !isAuthenticated(req) || !isTypingRoute(req);
            },
            getTracker: (req) =>
              `user:${String(authenticatedUserId(req))}:${String(readProperty(readProperty(req, 'params'), 'id')).toLowerCase()}`,
          },
          // Typing route only, before authentication: per IP, so bad tokens and random IDs are
          // limited too. Its own counter; the generic limit does not count typing.
          {
            name: 'typingIp',
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
            ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
            skipIf: (context) => {
              const req = context.switchToHttp().getRequest<FastifyRequest>();
              return isAuthenticated(req) || !isTypingRoute(req);
            },
          },
          // Login only: 5 attempts per 15 minutes per identifier (the per-IP limit is on
          // the route itself).
          {
            name: 'identifier',
            limit: 5,
            ttl: 15 * 60 * 1000,
            skipIf: (context) =>
              context.switchToHttp().getRequest<FastifyRequest>().routeOptions?.url !==
              '/api/v1/auth/login',
            getTracker: (req) => {
              const identifier = readProperty(readProperty(req, 'body'), 'identifier');
              return typeof identifier === 'string'
                ? `identifier:${identifier.normalize('NFC').toLowerCase()}`
                : `ip:${String(req['ip'])}`;
            },
          },
        ],
      }),
    }),
  ],
  // Rate limit every route by default.
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class ThrottlingModule {}
