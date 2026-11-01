import {
  ErrorCode,
  ErrorResponseSchema,
  MeResponseSchema,
  type UpdateProfileRequest,
  type User,
} from '@chat/contracts';

export type UpdateProfileResult = { ok: true; user: User } | { ok: false; error: string };

/** Calls `PATCH /api/v1/users/me`; a `null` Nickname clears it, an absent field is left as is. */
export async function updateProfile(
  accessToken: string,
  changes: UpdateProfileRequest,
): Promise<UpdateProfileResult> {
  let res: Response;
  try {
    res = await fetch(new URL('/api/v1/users/me', window.location.origin), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(changes),
    });
  } catch {
    return { ok: false, error: 'Could not reach the server. Try again.' };
  }

  const payload: unknown = await res.json().catch(() => undefined);
  if (res.ok) {
    const parsed = MeResponseSchema.safeParse(payload);
    return parsed.success
      ? { ok: true, user: parsed.data.user }
      : { ok: false, error: 'Something went wrong. Try again.' };
  }
  const code = ErrorResponseSchema.safeParse(payload).data?.error.code;
  if (code === ErrorCode.VALIDATION_FAILED) {
    return { ok: false, error: 'Nickname must be 1-50 characters, without control characters.' };
  }
  return { ok: false, error: 'Something went wrong. Try again.' };
}
