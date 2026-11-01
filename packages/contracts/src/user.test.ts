import { describe, expect, it } from 'vitest';
import {
  EmailSchema,
  NicknameSchema,
  PasswordSchema,
  RegisterRequestSchema,
  MeResponseSchema,
  RegisterResponseSchema,
  UpdateProfileRequestSchema,
  UsernameSchema,
} from './user.js';

describe('UsernameSchema', () => {
  it.each(['abc', 'Alice', 'a_b_c', 'user_123', 'A'.repeat(32), '___', '123'])(
    'accepts %j exactly as typed',
    (value) => {
      expect(UsernameSchema.parse(value)).toBe(value);
    },
  );

  it.each([
    ['too short', 'ab'],
    ['empty', ''],
    ['too long', 'a'.repeat(33)],
    ['space', 'al ice'],
    ['hyphen', 'al-ice'],
    ['dot', 'al.ice'],
    ['at sign', 'al@ice'],
    ['accented letter', 'álice'],
    ['non-latin letter', 'алиса'],
    ['emoji', 'alice😀'],
    ['leading whitespace (never trimmed)', ' alice'],
    ['trailing newline', 'alice\n'],
    ['NUL', 'ali\u0000ce'],
    ['tab', 'ali\tce'],
    ['C0 control', 'ali\u001fce'],
    ['DEL', 'ali\u007fce'],
    ['C1 control', 'ali\u0085ce'],
    ['right-to-left override', 'ali\u202Ece'],
    ['left-to-right embedding', 'ali\u202Ace'],
    ['isolate', 'ali\u2066ce'],
    ['pop isolate', 'ali\u2069ce'],
    ['decomposed accent (NFC turns it into a non-ASCII letter)', 'Amélie'],
  ])('rejects %s', (_label, value) => {
    expect(UsernameSchema.safeParse(value).success).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(UsernameSchema.safeParse(undefined).success).toBe(false);
    expect(UsernameSchema.safeParse(42).success).toBe(false);
  });
});

describe('EmailSchema', () => {
  it.each(['alice@example.com', 'Alice.Smith+tag@Example.COM', 'a@b.co'])(
    'accepts %j exactly as typed',
    (value) => {
      expect(EmailSchema.parse(value)).toBe(value);
    },
  );

  it.each([
    ['empty', ''],
    ['no at sign', 'alice.example.com'],
    ['no domain', 'alice@'],
    ['no local part', '@example.com'],
    ['inner space', 'ali ce@example.com'],
    ['surrounding space (never trimmed)', ' alice@example.com'],
    ['NUL', 'ali\u0000ce@example.com'],
    ['control character', 'ali\u0085ce@example.com'],
    ['too long', `${'a'.repeat(250)}@example.com`],
  ])('rejects %s', (_label, value) => {
    expect(EmailSchema.safeParse(value).success).toBe(false);
  });
});

describe('PasswordSchema', () => {
  it('accepts 8 and 128 characters, untrimmed', () => {
    expect(PasswordSchema.parse('12345678')).toBe('12345678');
    expect(PasswordSchema.parse('x'.repeat(128))).toHaveLength(128);
    expect(PasswordSchema.parse('  pass word  ')).toBe('  pass word  ');
  });

  it('counts characters, not UTF-16 units', () => {
    expect(PasswordSchema.safeParse('😀'.repeat(8)).success).toBe(true);
    expect(PasswordSchema.safeParse('😀'.repeat(128)).success).toBe(true);
    expect(PasswordSchema.safeParse('😀'.repeat(129)).success).toBe(false);
  });

  it('normalizes to NFC so the same visible password always hashes the same', () => {
    expect(PasswordSchema.parse('Cafe\u0301-Cafe\u0301')).toBe('Caf\u00E9-Caf\u00E9');
  });

  it.each([
    ['too short', '1234567'],
    ['empty', ''],
    ['too long', 'x'.repeat(129)],
    ['NUL', 'pass\u0000word'],
    ['newline', 'pass\nword'],
    ['C1 control', 'pass\u0085word'],
  ])('rejects %s', (_label, value) => {
    expect(PasswordSchema.safeParse(value).success).toBe(false);
  });
});

describe('NicknameSchema', () => {
  it('accepts 1 to 50 characters and preserves inner spacing and case', () => {
    expect(NicknameSchema.parse('A')).toBe('A');
    expect(NicknameSchema.parse('Ada  Lovelace')).toBe('Ada  Lovelace');
    expect(NicknameSchema.parse('x'.repeat(50))).toHaveLength(50);
    expect(NicknameSchema.parse('Zoë 😀')).toBe('Zoë 😀');
  });

  it('trims surrounding whitespace before checking length', () => {
    expect(NicknameSchema.parse('  Ada  ')).toBe('Ada');
    expect(NicknameSchema.parse(`  ${'x'.repeat(50)}  `)).toHaveLength(50);
  });

  it('normalizes to NFC', () => {
    expect(NicknameSchema.parse('Zoe\u0308')).toBe('Zo\u00EB');
  });

  it('counts characters, not UTF-16 units', () => {
    expect(NicknameSchema.safeParse('😀'.repeat(50)).success).toBe(true);
    expect(NicknameSchema.safeParse('😀'.repeat(51)).success).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['too long after trim', 'x'.repeat(51)],
    ['NUL', 'Ad\u0000a'],
    ['inner newline', 'Ad\na'],
    ['inner tab', 'Ad\ta'],
    ['C1 control', 'Ad\u0085a'],
    ['right-to-left override', 'Ad\u202Ea'],
    ['isolate', 'Ad\u2067a'],
  ])('rejects %s', (_label, value) => {
    expect(NicknameSchema.safeParse(value).success).toBe(false);
  });
});

describe('RegisterRequestSchema', () => {
  const valid = { username: 'Alice', email: 'Alice@Example.com', password: 'hunter2hunter2' };

  it('accepts the required fields and treats Nickname as optional', () => {
    expect(RegisterRequestSchema.parse(valid)).toEqual(valid);
    expect(RegisterRequestSchema.parse({ ...valid, nickname: ' Ali ' })).toEqual({
      ...valid,
      nickname: 'Ali',
    });
  });

  it.each(['username', 'email', 'password'] as const)('requires %s', (field) => {
    const rest = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field));
    expect(RegisterRequestSchema.safeParse(rest).success).toBe(false);
  });

  it('reports each invalid field under its own path', () => {
    const result = RegisterRequestSchema.safeParse({
      username: 'a',
      email: 'nope',
      password: 'short',
      nickname: '   ',
    });

    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path.join('.')) ?? [];
    expect(new Set(paths)).toEqual(new Set(['username', 'email', 'password', 'nickname']));
  });

  it('rejects a null Nickname', () => {
    expect(RegisterRequestSchema.safeParse({ ...valid, nickname: null }).success).toBe(false);
  });
});

describe('RegisterResponseSchema', () => {
  it('describes the new User and never carries a password', () => {
    const user = {
      id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b60',
      username: 'Alice',
      email: 'alice@example.com',
      nickname: null,
      shareReadReceipts: true,
    };
    expect(RegisterResponseSchema.parse({ user })).toEqual({ user });
    expect(Object.keys(RegisterResponseSchema.shape.user.shape)).not.toContain('password');
  });
});

describe('MeResponseSchema', () => {
  const user = {
    id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b60',
    username: 'Alice',
    email: 'alice@example.com',
    nickname: null,
  };

  it.each([true, false])('carries shareReadReceipts %j', (shareReadReceipts) => {
    expect(MeResponseSchema.parse({ user: { ...user, shareReadReceipts } })).toEqual({
      user: { ...user, shareReadReceipts },
    });
  });

  it('requires shareReadReceipts', () => {
    expect(MeResponseSchema.safeParse({ user }).success).toBe(false);
  });
});

describe('UpdateProfileRequestSchema', () => {
  it.each([
    ['the Nickname alone', { nickname: 'Ali' }],
    ['a cleared Nickname', { nickname: null }],
    ['shareReadReceipts alone', { shareReadReceipts: false }],
    ['both together', { nickname: 'Ali', shareReadReceipts: true }],
  ])('accepts %s', (_label, body) => {
    expect(UpdateProfileRequestSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['an empty body', {}],
    ['a string shareReadReceipts', { shareReadReceipts: 'false' }],
    ['a numeric shareReadReceipts', { shareReadReceipts: 0 }],
    ['a null shareReadReceipts', { shareReadReceipts: null }],
    ['an unknown field', { nickname: 'Ali', username: 'Mallory' }],
  ])('rejects %s', (_label, body) => {
    expect(UpdateProfileRequestSchema.safeParse(body).success).toBe(false);
  });
});
