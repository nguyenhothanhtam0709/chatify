import { Module } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import type { Database } from '../db/database.module.js';
import { AccessTokenAuthenticator } from './access-token-authenticator.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { PostgresTokenDenyList } from './postgres-token-deny-list.js';
import { TOKEN_DENY_LIST } from './token-deny-list.js';
import { TokenService } from './token.service.js';

/** The auth providers. Knows nothing about realtime, so realtime can depend on it. */
@Module({
  providers: [
    AuthService,
    TokenService,
    AccessTokenAuthenticator,
    AuthGuard,
    {
      provide: TOKEN_DENY_LIST,
      inject: [getDrizzleToken()],
      useFactory: (db: Database): PostgresTokenDenyList => new PostgresTokenDenyList(db),
    },
  ],
  exports: [AuthService, TokenService, AccessTokenAuthenticator, AuthGuard],
})
export class AuthModule {}
