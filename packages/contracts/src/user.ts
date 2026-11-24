import { z } from 'zod';
import { codePointOf } from './code-point.js';

/** NUL, C0 and C1 control characters (includes tab and newline). */
const isControl = (cp: number): boolean => cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
/** Bidi overrides, embeddings and isolates (ADR-0002). */
const isBidiOverride = (cp: number): boolean =>
  (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);

const hasChar = (value: string, test: (cp: number) => boolean): boolean =>
  Array.from(value).some((char) => test(codePointOf(char)));

const codePointLength = (value: string): number => Array.from(value).length;

/**
 * Text that is Unicode-NFC normalized and free of control characters; the base of every
 * user-supplied string (ADR-0002: validate, never rewrite beyond NFC and trimming of names).
 */
const plainText = z
  .string()
  .transform((value) => value.normalize('NFC'))
  .refine((value) => !hasChar(value, isControl), 'must not contain control characters');

/** Same, and additionally free of bidi-override characters (names). */
export const nameText = (trim: boolean): z.ZodPipe<z.ZodString, z.ZodTransform<string, string>> =>
  z
    .string()
    .transform((value) => (trim ? value.normalize('NFC').trim() : value.normalize('NFC')))
    .refine((value) => !hasChar(value, isControl), 'must not contain control characters')
    .refine((value) => !hasChar(value, isBidiOverride), 'must not contain bidirectional overrides');

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;

/** Letters, digits or underscores; case is preserved, uniqueness is case-insensitive. */
export const UsernameSchema = nameText(false).refine(
  (value) => new RegExp(`^[A-Za-z0-9_]{${USERNAME_MIN},${USERNAME_MAX}}$`).test(value),
  {
    message: `must be ${USERNAME_MIN}-${USERNAME_MAX} characters: letters, digits or underscore`,
  },
);

/** Valid email format, at most 254 characters; stored as typed, compared case-insensitively. */
export const EmailSchema = plainText.pipe(z.email().max(254));

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Counted as characters, not UTF-16 units; never trimmed. */
export const PasswordSchema = plainText.refine(
  (value) => {
    const length = codePointLength(value);
    return length >= PASSWORD_MIN && length <= PASSWORD_MAX;
  },
  { message: `must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters` },
);

export const NICKNAME_MAX = 50;

/** Optional display name: trimmed, 1-`NICKNAME_MAX` characters, no control or bidi-override characters. */
export const NicknameSchema = nameText(true).refine(
  (value) => {
    const length = codePointLength(value);
    return length >= 1 && length <= NICKNAME_MAX;
  },
  { message: `must be 1-${NICKNAME_MAX} characters` },
);

/**
 * `PATCH /users/me`: update the caller's profile. The Nickname (`null` clears it) and whether
 * to share read receipts are editable, alone or together; at least one must be given. The
 * schema is strict so a Username, email or anything else is rejected rather than silently
 * ignored.
 */
export const UpdateProfileRequestSchema = z
  .strictObject({
    nickname: NicknameSchema.nullable().optional(),
    shareReadReceipts: z.boolean().optional(),
  })
  .refine((body) => body.nickname !== undefined || body.shareReadReceipts !== undefined, {
    message: 'must contain nickname or shareReadReceipts',
  });

export type UpdateProfileRequest = z.input<typeof UpdateProfileRequestSchema>;

/** `POST /auth/register`. Strict: the Nickname is optional, so a misspelled `nicknme` is a 400. */
export const RegisterRequestSchema = z.strictObject({
  username: UsernameSchema,
  email: EmailSchema,
  password: PasswordSchema,
  nickname: NicknameSchema.optional(),
});

export type RegisterRequest = z.input<typeof RegisterRequestSchema>;

export const RegisterResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    username: z.string(),
    email: z.string(),
    nickname: z.string().nullable(),
    /** Whether this User shares read receipts (on by default); only ever sent to its owner. */
    shareReadReceipts: z.boolean(),
  }),
});

export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const UserSchema = RegisterResponseSchema.shape.user;

export type User = z.infer<typeof UserSchema>;

/** Sign-in: a Username or an email, plus the password. Deliberately lenient: no policy checks. */
export const LoginRequestSchema = z.object({
  identifier: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

export type LoginRequest = z.input<typeof LoginRequestSchema>;

/** The access token is short-lived and lives only in SPA memory; the refresh token is a cookie. */
export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: UserSchema,
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
});

export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

/** `GET /users/me` and `PATCH /users/me`: the caller's own profile. */
export const MeResponseSchema = z.object({ user: UserSchema });

export type MeResponse = z.infer<typeof MeResponseSchema>;

/** Most Users a search returns. */
export const USER_SEARCH_LIMIT = 20;

/** `GET /users/search?q=`: 2-32 characters, matched as a Username prefix (never rewritten). */
export const SearchUsersQuerySchema = z.object({
  q: plainText.refine(
    (value) => {
      const length = codePointLength(value);
      return length >= 2 && length <= 32;
    },
    { message: 'must be 2-32 characters' },
  ),
});

export type SearchUsersQuery = z.input<typeof SearchUsersQuerySchema>;

/**
 * A search hit: ID, Username and Nickname only. Strict, so API tests fail if a response leaks an
 * extra User field, and the client throws on one. The API never parses responses, so this does
 * not stop the server sending a field.
 */
export const UserSearchResultSchema = z.strictObject({
  id: z.uuid(),
  username: z.string(),
  nickname: z.string().nullable(),
});

export type UserSearchResult = z.infer<typeof UserSearchResultSchema>;

export const SearchUsersResponseSchema = z.object({
  users: z.array(UserSearchResultSchema).max(USER_SEARCH_LIMIT),
});

export type SearchUsersResponse = z.infer<typeof SearchUsersResponseSchema>;
