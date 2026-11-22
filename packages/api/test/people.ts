import { CreateGroupResponseSchema, LoginResponseSchema, type Group } from '@chat/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

const password = 'correct horse battery';

export interface Person {
  id: string;
  token: string;
}

export async function signUp(app: NestFastifyApplication, username: string): Promise<Person> {
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { username, email: `${username.toLowerCase()}@example.com`, password },
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier: username, password },
  });
  const login = LoginResponseSchema.parse(res.json());
  return { id: login.user.id, token: login.accessToken };
}

export const bearer = (p: Person): { authorization: string } => ({
  authorization: `Bearer ${p.token}`,
});

export async function createGroup(
  app: NestFastifyApplication,
  owner: Person,
  memberIds: string[] = [],
): Promise<Group> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/groups',
    headers: bearer(owner),
    payload: { name: 'Club', memberIds },
  });
  return CreateGroupResponseSchema.parse(res.json()).conversation;
}
