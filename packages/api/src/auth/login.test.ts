import type { LightMyRequestResponse } from 'fastify';
import { ErrorCode, ErrorResponseSchema, LoginResponseSchema } from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';
import { withApp } from '../../test/app-harness.js';

const alice = {
  username: 'Alice',
  email: 'Alice@Example.com',
  password: 'correct horse battery',
  nickname: 'Ali',
};

async function registerAlice(app: NestFastifyApplication): Promise<void> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: alice });
  expect(res.statusCode).toBe(201);
}

function login(
  app: NestFastifyApplication,
  identifier: string,
  password = alice.password,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier, password },
  });
}
describe('POST /auth/login', () => {
  it('signs a User in by Username and returns an access token and the User', async () => {
    await withApp({}, async (app) => {
      await registerAlice(app);

      const res = await login(app, 'Alice');

      expect(res.statusCode).toBe(200);
      const body = LoginResponseSchema.parse(res.json());
      expect(body.user).toMatchObject({ username: 'Alice', nickname: 'Ali' });
      expect(body.accessToken.split('.')).toHaveLength(3);
      expect(res.body).not.toContain(alice.password);
    });
  });

  it.each(['alice', 'ALICE', 'alice@example.com', 'ALICE@EXAMPLE.COM'])(
    'matches the identifier %s case-insensitively',
    async (identifier) => {
      await withApp({}, async (app) => {
        await registerAlice(app);

        const res = await login(app, identifier);

        expect(res.statusCode).toBe(200);
        expect(LoginResponseSchema.parse(res.json()).user.username).toBe('Alice');
      });
    },
  );

  it('does comparable hashing work whether or not the User exists', async () => {
    await withApp({}, async (app) => {
      await registerAlice(app);
      const median = async (identifier: string): Promise<number> => {
        const times: number[] = [];
        for (let i = 0; i < 3; i++) {
          const start = performance.now();
          await login(app, identifier, 'not the password');
          times.push(performance.now() - start);
        }
        return times.sort((a, b) => a - b)[1]!;
      };

      const existing = await median('alice');
      const missing = await median('nobody');

      expect(missing).toBeGreaterThan(existing * 0.5);
    });
  });

  it('answers a wrong password and an unknown User with the same INVALID_CREDENTIALS', async () => {
    await withApp({}, async (app) => {
      await registerAlice(app);

      const wrongPassword = await login(app, 'alice', 'not the password');
      const unknown = await login(app, 'nobody', alice.password);

      for (const res of [wrongPassword, unknown]) {
        expect(res.statusCode).toBe(401);
        expect(ErrorResponseSchema.parse(res.json()).error.code).toBe(
          ErrorCode.INVALID_CREDENTIALS,
        );
      }
      expect(wrongPassword.json()).toEqual(unknown.json());
    });
  });
});
