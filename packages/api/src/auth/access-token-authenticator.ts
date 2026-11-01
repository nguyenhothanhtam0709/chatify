import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@chat/contracts';
import { AuthService } from './auth.service.js';
import { TOKEN_DENY_LIST, type TokenDenyList } from './token-deny-list.js';
import { TokenService } from './token.service.js';

export interface AuthContext {
  userId: string;
  sessionId: string;
  jti: string;
  expiresAt: number;
}

export type AccessTokenCheck =
  | { ok: true; auth: AuthContext }
  | { ok: false; code: typeof ErrorCode.UNAUTHENTICATED | typeof ErrorCode.SESSION_REVOKED };

/**
 * Checks an access token's signature and expiry, then the deny-list and that its session still
 * exists. Shared by HTTP requests (`AuthGuard`) and the Socket.IO handshake.
 */
@Injectable()
export class AccessTokenAuthenticator {
  constructor(
    private readonly tokens: TokenService,
    @Inject(TOKEN_DENY_LIST) private readonly denyList: TokenDenyList,
    private readonly auth: AuthService,
  ) {}

  public async check(token: string | undefined): Promise<AccessTokenCheck> {
    const claims = token ? await this.tokens.verifyAccessToken(token) : undefined;
    if (!claims) return { ok: false, code: ErrorCode.UNAUTHENTICATED };
    // Logout denies the token; a session ended any other way (refresh-token reuse) is gone.
    if (
      (await this.denyList.isDenied(claims.jti)) ||
      !(await this.auth.isSessionActive(claims.sid))
    ) {
      return { ok: false, code: ErrorCode.SESSION_REVOKED };
    }
    return {
      ok: true,
      auth: { userId: claims.sub, sessionId: claims.sid, jti: claims.jti, expiresAt: claims.exp },
    };
  }
}
