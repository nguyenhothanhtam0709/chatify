import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode, type RegisterResponse, type SearchUsersResponse } from '@chat/contracts';
import * as argon2 from 'argon2';
import { and, eq, gt, ne, or, sql } from 'drizzle-orm';
import { DomainException } from '../common/all-exceptions.filter.js';
import type { Config } from '../config/config.js';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Database } from '../db/database.module.js';
import { exactlyOne } from '../db/exactly-one.js';
import { sessions, users } from '../db/schema.js';
import { TOKEN_DENY_LIST, type TokenDenyList } from './token-deny-list.js';
import type { AuthContext } from './auth.guard.js';
import { hashPassword } from './password-hash.js';
import { TokenService } from './token.service.js';

export interface NewUser {
  username: string;
  email: string;
  password: string;
  nickname?: string | undefined;
}

const UNIQUE_VIOLATION = '23505';

export interface IssuedSession {
  accessToken: string;
  /** The opaque refresh token; goes into the cookie, never into a response body or a log. */
  refreshToken: string;
  refreshExpiresAt: Date;
}

const publicUser = {
  id: users.id,
  username: users.username,
  email: users.email,
  nickname: users.nickname,
  shareReadReceipts: users.shareReadReceipts,
};

/** The profile fields a User can change; an absent field is left as it is. */
export interface ProfileChanges {
  /** `null` clears the Nickname. */
  nickname?: string | null | undefined;
  shareReadReceipts?: boolean | undefined;
}

@Injectable()
export class AuthService {
  private readonly refreshTtlSeconds: number;
  /** Verified against when the User does not exist, so both paths do the same hashing work. */
  private readonly dummyHash: Promise<string>;

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly tokens: TokenService,
    @Inject(TOKEN_DENY_LIST) private readonly denyList: TokenDenyList,
    config: ConfigService<Config, true>,
  ) {
    this.refreshTtlSeconds = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 24 * 60 * 60;
    this.dummyHash = argon2.hash(randomBytes(16).toString('hex'), { type: argon2.argon2id });
  }

  /** The database computes "now plus the refresh TTL"; only the duration is passed in. */
  private refreshExpiry() {
    return sql`now() + make_interval(secs => ${this.refreshTtlSeconds})`;
  }

  /** Any failure is the same generic INVALID_CREDENTIALS. */
  public async login(
    identifier: string,
    password: string,
  ): Promise<IssuedSession & { user: RegisterResponse['user'] }> {
    const needle = identifier.normalize('NFC').toLowerCase();
    const [row] = await this.db
      .select({ ...publicUser, passwordHash: users.passwordHash })
      .from(users)
      .where(or(sql`lower(${users.username}) = ${needle}`, sql`lower(${users.email}) = ${needle}`))
      .limit(1);

    const matches = await argon2.verify(row?.passwordHash ?? (await this.dummyHash), password);
    if (!row || !matches) {
      throw new DomainException(
        ErrorCode.INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
        'Invalid credentials',
      );
    }

    const user = {
      id: row.id,
      username: row.username,
      email: row.email,
      nickname: row.nickname,
      shareReadReceipts: row.shareReadReceipts,
    };
    const refreshToken = this.tokens.newRefreshToken();
    const created = exactlyOne(
      await this.db
        .insert(sessions)
        .values({
          userId: user.id,
          refreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
          rotatedAt: sql`now()`,
          expiresAt: this.refreshExpiry(),
        })
        .returning({ id: sessions.id, expiresAt: sessions.expiresAt }),
      'the created session',
    );
    return {
      accessToken: await this.tokens.signAccessToken(user.id, created.id),
      refreshToken,
      refreshExpiresAt: created.expiresAt,
      user,
    };
  }

  /** Swaps a live refresh token for a new one and a fresh access token. */
  public async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    const unauthenticated = () =>
      new DomainException(ErrorCode.UNAUTHENTICATED, HttpStatus.UNAUTHORIZED, 'Not signed in');
    if (!refreshToken) throw unauthenticated();

    const next = this.tokens.newRefreshToken();
    // One conditional UPDATE, so two concurrent refreshes with the same token cannot both win.
    const [session] = await this.db
      .update(sessions)
      .set({
        previousRefreshTokenHash: sessions.refreshTokenHash,
        refreshTokenHash: this.tokens.hashRefreshToken(next),
        rotatedAt: sql`now()`,
        expiresAt: this.refreshExpiry(),
      })
      .where(
        and(
          eq(sessions.refreshTokenHash, this.tokens.hashRefreshToken(refreshToken)),
          gt(sessions.expiresAt, sql`now()`),
        ),
      )
      .returning({ id: sessions.id, userId: sessions.userId, expiresAt: sessions.expiresAt });
    if (!session) {
      // A token that was already rotated away is being replayed: assume it was stolen and
      // end the whole session, so neither the thief nor the owner can keep refreshing.
      await this.db
        .delete(sessions)
        .where(eq(sessions.previousRefreshTokenHash, this.tokens.hashRefreshToken(refreshToken)));
      throw unauthenticated();
    }

    return {
      accessToken: await this.tokens.signAccessToken(session.userId, session.id),
      refreshToken: next,
      refreshExpiresAt: session.expiresAt,
    };
  }

  /** Ends the session now: its access token is denied until it would expire anyway. */
  public async logout(auth: AuthContext): Promise<void> {
    await this.denyList.add(auth.jti, new Date(auth.expiresAt * 1000));
    await this.db.delete(sessions).where(eq(sessions.id, auth.sessionId));
    await this.denyList.sweepExpired();
  }

  public async isSessionActive(sessionId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    return rows.length > 0;
  }

  public async getUser(userId: string): Promise<RegisterResponse['user']> {
    const [user] = await this.db.select(publicUser).from(users).where(eq(users.id, userId));
    if (!user) {
      throw new DomainException(
        ErrorCode.UNAUTHENTICATED,
        HttpStatus.UNAUTHORIZED,
        'Not signed in',
      );
    }
    return user;
  }

  /**
   * Users whose Username starts with `q` (case-insensitive; `%`, `_` and `\` are literal),
   * the exact match first, at most 20, never the searcher. Public fields only.
   */
  public async searchUsers(searcherId: string, q: string): Promise<SearchUsersResponse['users']> {
    const needle = q.toLowerCase();
    const prefix = `${needle.replace(/[\\%_]/g, '\\$&')}%`;
    return this.db
      .select({ id: users.id, username: users.username, nickname: users.nickname })
      .from(users)
      .where(
        and(sql`lower(${users.username}) like ${prefix} escape '\\'`, ne(users.id, searcherId)),
      )
      .orderBy(sql`(lower(${users.username}) = ${needle}) desc`, sql`lower(${users.username})`)
      .limit(20);
  }

  /** Changes the Nickname and/or the share read receipts setting; pushes nothing. */
  public async updateProfile(
    userId: string,
    changes: ProfileChanges,
  ): Promise<RegisterResponse['user']> {
    const [user] = await this.db
      .update(users)
      .set({ nickname: changes.nickname, shareReadReceipts: changes.shareReadReceipts })
      .where(eq(users.id, userId))
      .returning(publicUser);
    if (!user) {
      throw new DomainException(
        ErrorCode.UNAUTHENTICATED,
        HttpStatus.UNAUTHORIZED,
        'Not signed in',
      );
    }
    return user;
  }

  public async register(input: NewUser): Promise<RegisterResponse> {
    const passwordHash = await hashPassword(input.password);
    try {
      const row = exactlyOne(
        await this.db
          .insert(users)
          .values({
            username: input.username,
            email: input.email,
            passwordHash,
            nickname: input.nickname ?? null,
          })
          .returning(publicUser),
        'the registered user',
      );
      return { user: row };
    } catch (error) {
      throw translateUniqueViolation(error) ?? error;
    }
  }
}

/**
 * Uniqueness is decided by the database constraints (race-free); the violated constraint
 * tells which field was taken. Only the constraint name is used, never pg's `detail`
 * (which contains the offending value).
 */
function translateUniqueViolation(error: unknown): DomainException | undefined {
  const { code, constraint } = (error as { code?: string; constraint?: string } | null) ?? {};
  const cause = (error as { cause?: unknown } | null)?.cause;
  if (code !== UNIQUE_VIOLATION && cause) return translateUniqueViolation(cause);
  if (code !== UNIQUE_VIOLATION) return undefined;
  if (constraint === 'users_username_lower_unique') {
    return new DomainException(
      ErrorCode.USERNAME_TAKEN,
      HttpStatus.CONFLICT,
      'Username is already taken',
    );
  }
  if (constraint === 'users_email_lower_unique') {
    return new DomainException(
      ErrorCode.EMAIL_TAKEN,
      HttpStatus.CONFLICT,
      'Email is already registered',
    );
  }
  return undefined;
}
