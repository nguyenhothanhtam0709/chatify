import {
  GetConversationResponseSchema,
  GetMessagesResponseSchema,
  ListConversationsResponseSchema,
  MarkReadResponseSchema,
  type ConversationSummary,
  type Message,
  type TypingState,
} from '@chat/contracts';

export type ListConversationsResult =
  { ok: true; conversations: ConversationSummary[] } | { ok: false; error: string };

export type ReadReceiptResult =
  { ok: true; readUpToSequence: number | undefined } | { ok: false; error: string };

/** `retryable`: the failure may pass by itself (a 5xx, a 429 or no network), so trying again can work. */
export type MarkReadResult =
  { ok: true; upToSequence: number } | { ok: false; error: string; retryable?: true };

export type MessagesCursor = { before?: number; after?: number };

export type MessagesPageResult =
  { ok: true; messages: Message[]; hasMore: boolean } | { ok: false; error: string };

async function get(accessToken: string, path: string, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(new URL(path, window.location.origin), {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: signal ?? null,
    });
  } catch {
    return { ok: false, error: 'Could not reach the server. Try again.' } as const;
  }
  if (!res.ok) return { ok: false, error: 'Something went wrong. Try again.' } as const;
  const payload: unknown = await res.json().catch(() => undefined);
  return { ok: true, payload } as const;
}

/** `GET /api/v1/conversations`: already sorted, most recently active first. */
export async function listConversations(
  accessToken: string,
  signal?: AbortSignal,
): Promise<ListConversationsResult> {
  const res = await get(accessToken, '/api/v1/conversations', signal);
  if (!res.ok) return res;
  return { ok: true, ...ListConversationsResponseSchema.parse(res.payload) };
}

/**
 * `GET /api/v1/conversations/:id`, for its Read Receipt: the other User's Read Marker in a
 * Direct Conversation when both Users share read receipts, else `undefined`.
 */
export async function readReceipt(
  accessToken: string,
  conversationId: string,
  signal?: AbortSignal,
): Promise<ReadReceiptResult> {
  const res = await get(accessToken, `/api/v1/conversations/${conversationId}`, signal);
  if (!res.ok) return res;
  const { conversation } = GetConversationResponseSchema.parse(res.payload);
  return {
    ok: true,
    readUpToSequence: conversation.kind === 'direct' ? conversation.readUpToSequence : undefined,
  };
}

/**
 * `GET /api/v1/conversations/:id/messages`: a page of Messages, returned oldest first. Without
 * a cursor it is the newest page; `before` gives the page just older than that sequence, and
 * `after` the page just newer (to fill a gap).
 */
export async function messagesPage(
  accessToken: string,
  conversationId: string,
  cursor: MessagesCursor = {},
  signal?: AbortSignal,
): Promise<MessagesPageResult> {
  const query =
    cursor.before !== undefined
      ? `?before=${cursor.before}`
      : cursor.after !== undefined
        ? `?after=${cursor.after}`
        : '';
  const res = await get(
    accessToken,
    `/api/v1/conversations/${conversationId}/messages${query}`,
    signal,
  );
  if (!res.ok) return res;
  const { messages, hasMore } = GetMessagesResponseSchema.parse(res.payload);
  // `before` and the default come newest first; `after` already comes oldest first.
  return {
    ok: true,
    messages: cursor.after === undefined ? [...messages].reverse() : messages,
    hasMore,
  };
}

/**
 * `PUT /api/v1/conversations/:id/read`: moves the User's Read Marker forward (never back) and
 * answers with where it is now.
 */
export async function markRead(
  accessToken: string,
  conversationId: string,
  upToSequence: number,
): Promise<MarkReadResult> {
  let res: Response;
  try {
    res = await fetch(
      new URL(`/api/v1/conversations/${conversationId}/read`, window.location.origin),
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ upToSequence }),
      },
    );
  } catch {
    return { ok: false, error: 'Could not reach the server. Try again.', retryable: true };
  }
  if (!res.ok) {
    const retryable = res.status >= 500 || res.status === 429;
    return {
      ok: false,
      error: 'Something went wrong. Try again.',
      ...(retryable ? { retryable: true as const } : {}),
    };
  }
  const parsed = MarkReadResponseSchema.safeParse(await res.json().catch(() => undefined));
  return parsed.success
    ? { ok: true, upToSequence: parsed.data.upToSequence }
    : { ok: false, error: 'Something went wrong. Try again.' };
}

export type TypingResult = { ok: true } | { ok: false };

/**
 * `POST /api/v1/conversations/:id/typing`: a best-effort Typing Indicator signal. Failures and
 * rate limits are ignored on purpose; the other side's indicator just expires.
 */
export async function signalTyping(
  accessToken: string,
  conversationId: string,
  state: TypingState,
): Promise<TypingResult> {
  try {
    const res = await fetch(
      new URL(`/api/v1/conversations/${conversationId}/typing`, window.location.origin),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ state }),
      },
    );
    return res.ok ? { ok: true } : { ok: false };
  } catch {
    // Typing is only a hint: callers ignore the result.
    return { ok: false };
  }
}
