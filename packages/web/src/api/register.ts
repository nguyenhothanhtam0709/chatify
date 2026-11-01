import {
  ErrorCode,
  ErrorResponseSchema,
  RegisterResponseSchema,
  type RegisterRequest,
  type RegisterResponse,
} from '@chat/contracts';

export type RegisterField = 'username' | 'email' | 'password' | 'nickname';

export type RegisterResult =
  | { ok: true; user: RegisterResponse['user'] }
  | { ok: false; fieldErrors: Partial<Record<RegisterField, string>>; formError?: string };

const FIELDS: readonly string[] = ['username', 'email', 'password', 'nickname'];

function isField(value: unknown): value is RegisterField {
  return typeof value === 'string' && FIELDS.includes(value);
}

/** Calls `POST /api/v1/auth/register` and turns API errors into per-field messages. */
export async function register(
  input: RegisterRequest,
  signal?: AbortSignal,
): Promise<RegisterResult> {
  let res: Response;
  try {
    res = await fetch(new URL('/api/v1/auth/register', window.location.origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: signal ?? null,
    });
  } catch {
    return { ok: false, fieldErrors: {}, formError: 'Could not reach the server. Try again.' };
  }

  const payload: unknown = await res.json().catch(() => undefined);
  if (res.ok) {
    return { ok: true, user: RegisterResponseSchema.parse(payload).user };
  }

  const parsed = ErrorResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, fieldErrors: {}, formError: 'Something went wrong. Try again.' };
  }
  const { code, details } = parsed.data.error;
  switch (code) {
    case ErrorCode.USERNAME_TAKEN:
      return { ok: false, fieldErrors: { username: 'This username is already taken.' } };
    case ErrorCode.EMAIL_TAKEN:
      return { ok: false, fieldErrors: { email: 'This email is already registered.' } };
    case ErrorCode.RATE_LIMITED:
      return {
        ok: false,
        fieldErrors: {},
        formError: 'Too many sign-up attempts. Try again later.',
      };
    case ErrorCode.VALIDATION_FAILED: {
      const fieldErrors: Partial<Record<RegisterField, string>> = {};
      for (const issue of Array.isArray(details) ? (details as unknown[]) : []) {
        const { path, message } = (issue ?? {}) as { path?: unknown[]; message?: unknown };
        const field = path?.[0];
        if (isField(field) && typeof message === 'string' && !(field in fieldErrors)) {
          fieldErrors[field] = message;
        }
      }
      return Object.keys(fieldErrors).length > 0
        ? { ok: false, fieldErrors }
        : { ok: false, fieldErrors: {}, formError: 'Please check the form and try again.' };
    }
    default:
      return { ok: false, fieldErrors: {}, formError: 'Something went wrong. Try again.' };
  }
}
