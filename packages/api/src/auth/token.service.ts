import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, importPKCS8, importSPKI, jwtVerify, type CryptoKey } from 'jose';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { Config } from '../config/config.js';

const AccessClaimsSchema = z.object({
  sub: z.string(),
  sid: z.string(),
  jti: z.string(),
  iat: z.number(),
  exp: z.number(),
});

export type AccessClaims = z.infer<typeof AccessClaimsSchema>;

const ALG = 'EdDSA';

/**
 * Issues and verifies EdDSA (Ed25519) access tokens, and generates and hashes refresh tokens.
 *
 * `jose` is used rather than `@nestjs/jwt`: that wraps `jsonwebtoken` v9, which cannot sign
 * or verify EdDSA.
 */
@Injectable()
export class TokenService {
  private readonly ttlSeconds: number;
  private readonly privateKey: Promise<CryptoKey>;
  private readonly publicKey: Promise<CryptoKey>;

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService<Config, true>,
  ) {
    this.ttlSeconds = config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    this.privateKey = importPKCS8(config.get('JWT_PRIVATE_KEY', { infer: true }), ALG);
    this.publicKey = importSPKI(config.get('JWT_PUBLIC_KEY', { infer: true }), ALG);
    // Surfaced when the key is first used; never an unhandled rejection at boot.
    this.privateKey.catch(() => undefined);
    this.publicKey.catch(() => undefined);
  }

  /** Signs with the injectable clock, so tests control `iat` and `exp`. */
  public async signAccessToken(userId: string, sessionId: string): Promise<string> {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: ALG, typ: 'JWT' })
      .setSubject(userId)
      .setJti(uuidv7())
      .setIssuedAt(iat)
      .setExpirationTime(iat + this.ttlSeconds)
      .sign(await this.privateKey);
  }

  /** Returns the claims of a valid, unexpired token, or undefined for anything else. */
  public async verifyAccessToken(token: string): Promise<AccessClaims | undefined> {
    try {
      const { payload } = await jwtVerify(token, await this.publicKey, {
        algorithms: [ALG],
        currentDate: this.clock.now(),
        requiredClaims: ['sub', 'sid', 'jti', 'iat', 'exp'],
      });
      const claims = AccessClaimsSchema.safeParse(payload);
      return claims.success ? claims.data : undefined;
    } catch {
      return undefined;
    }
  }

  /** An opaque 256-bit random value. */
  public newRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /** Refresh tokens are high-entropy, so a fast hash is enough to keep them unusable if leaked. */
  public hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
