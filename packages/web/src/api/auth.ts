import {
  ErrorCode,
  ErrorResponseSchema,
  LoginResponseSchema,
  MeResponseSchema,
  RefreshResponseSchema,
  type LoginRequest,
  type User,
} from '@chat/contracts';

export type LoginResult =
  { ok: true; accessToken: string; user: User } | { ok: false; error: string };

const url = (path: string) => new URL(`/api/v1${path}`, window.location.origin);

/** Calls `POST /api/v1/auth/login`. Every failure is one generic message. */
export async function login(input: LoginRequest): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: 'Could not reach the server. Try again.' };
  }

  const payload: unknown = await res.json().catch(() => undefined);
  if (res.ok) {
    const { accessToken, user } = LoginResponseSchema.parse(payload);
    return { ok: true, accessToken, user };
  }
  const code = ErrorResponseSchema.safeParse(payload).data?.error.code;
  switch (code) {
    case ErrorCode.INVALID_CREDENTIALS:
      return { ok: false, error: 'Invalid username, email or password.' };
    case ErrorCode.RATE_LIMITED:
      return { ok: false, error: 'Too many sign-in attempts. Try again later.' };
    default:
      return { ok: false, error: 'Something went wrong. Try again.' };
  }
}

/** Trades the refresh cookie for a new access token; `undefined` when not signed in. */
export async function refreshAccessToken(signal?: AbortSignal): Promise<string | undefined> {
  try {
    const res = await fetch(url('/auth/refresh'), {
      method: 'POST',
      credentials: 'same-origin',
      signal: signal ?? null,
    });
    if (!res.ok) return undefined;
    return RefreshResponseSchema.parse(await res.json()).accessToken;
  } catch {
    return undefined;
  }
}

/** Ends the session on the server. Best effort: the caller signs out locally either way. */
export async function logout(accessToken: string): Promise<void> {
  try {
    await fetch(url('/auth/logout'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Nothing to do: the access token is short-lived and the User is signed out here.
  }
}

/** The signed-in User's profile; `undefined` when the access token is not accepted. */
export async function fetchCurrentUser(
  accessToken: string,
  signal?: AbortSignal,
): Promise<User | undefined> {
  try {
    const res = await fetch(url('/users/me'), {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: signal ?? null,
    });
    if (!res.ok) return undefined;
    return MeResponseSchema.parse(await res.json()).user;
  } catch {
    return undefined;
  }
}

/** Milliseconds until the access token expires, read from its `exp` claim (never verified here). */
export function msUntilExpiry(accessToken: string): number {
  try {
    const payload = accessToken.split('.')[1] ?? '';
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp: number;
    };
    return exp * 1000 - Date.now();
  } catch {
    return 0;
  }
}
