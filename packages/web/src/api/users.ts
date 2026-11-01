import {
  ErrorCode,
  ErrorResponseSchema,
  SearchUsersResponseSchema,
  type UserSearchResult,
} from '@chat/contracts';

export type SearchUsersResult =
  { ok: true; users: UserSearchResult[] } | { ok: false; error: string };

/** Calls `GET /api/v1/users/search?q=`; the server does the matching and ranking. */
export async function searchUsers(
  accessToken: string,
  q: string,
  signal?: AbortSignal,
): Promise<SearchUsersResult> {
  const url = new URL('/api/v1/users/search', window.location.origin);
  url.searchParams.set('q', q);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: signal ?? null,
    });
  } catch {
    return { ok: false, error: 'Could not reach the server. Try again.' };
  }

  const payload: unknown = await res.json().catch(() => undefined);
  if (res.ok) return { ok: true, users: SearchUsersResponseSchema.parse(payload).users };
  const code = ErrorResponseSchema.safeParse(payload).data?.error.code;
  if (code === ErrorCode.RATE_LIMITED) {
    return { ok: false, error: 'Too many searches. Wait a moment and try again.' };
  }
  return { ok: false, error: 'Something went wrong. Try again.' };
}
