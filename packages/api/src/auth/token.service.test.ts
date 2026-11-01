import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SignJWT, importPKCS8 } from 'jose';
import { describe, expect, it } from 'vitest';
import type { Config } from '../config/config.js';
import { testJwtKeys } from '../../test/keys.js';
import { testClock } from '../../test/test-clock.js';
import { TokenService } from './token.service.js';

function service() {
  const clock = testClock();
  const values: Partial<Config> = { ...testJwtKeys, ACCESS_TOKEN_TTL_SECONDS: 900 };
  const config = new ConfigService<Config, true>(values);
  return { tokens: new TokenService(clock.clock, config), clock: clock.clock };
}

async function sign(
  claims: Record<string, unknown>,
  iat: number,
  privateKeyPem = testJwtKeys.JWT_PRIVATE_KEY,
): Promise<string> {
  const key = await importPKCS8(privateKeyPem, 'EdDSA');
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
    .setIssuedAt(iat)
    .setExpirationTime(iat + 900)
    .sign(key);
}

describe('TokenService.verifyAccessToken', () => {
  it('accepts a token the service issued', async () => {
    const { tokens } = service();
    const token = await tokens.signAccessToken('user-1', 'session-1');
    expect(await tokens.verifyAccessToken(token)).toMatchObject({
      sub: 'user-1',
      sid: 'session-1',
    });
  });

  it('rejects a signed token whose claims have the wrong type', async () => {
    const { tokens, clock } = service();
    const iat = Math.floor(clock.now().getTime() / 1000);
    const token = await sign({ sub: 'user-1', sid: 42, jti: 'j' }, iat);
    expect(await tokens.verifyAccessToken(token)).toBeUndefined();
  });

  it('rejects a token signed by another key', async () => {
    const { tokens, clock } = service();
    const iat = Math.floor(clock.now().getTime() / 1000);
    const other = generateKeyPairSync('ed25519')
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    const token = await sign({ sub: 'u', sid: 's', jti: 'j' }, iat, other);
    expect(await tokens.verifyAccessToken(token)).toBeUndefined();
  });
});
