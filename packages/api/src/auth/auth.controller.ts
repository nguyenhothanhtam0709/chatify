import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type RefreshResponse,
  type RegisterRequest,
  type RegisterResponse,
} from '@chat/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Auth, AuthGuard, type AuthContext } from './auth.guard.js';
import { AuthService, type IssuedSession } from './auth.service.js';

export const REFRESH_COOKIE = 'refresh_token';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/** Always sent with these attributes; the cookie is only ever readable by the refresh route. */
function setRefreshCookie(reply: FastifyReply, session: IssuedSession): void {
  void reply.setCookie(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/api/v1/auth',
    expires: session.refreshExpiresAt,
  });
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** 5 registrations per hour per IP. */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  public register(
    @Body(new ZodValidationPipe(RegisterRequestSchema)) body: RegisterRequest,
  ): Promise<RegisterResponse> {
    return this.auth.register(body);
  }

  /** 10 attempts per 15 minutes per IP here, plus 5 per identifier (see ThrottlingModule). */
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: FIFTEEN_MINUTES_MS } })
  public async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const { accessToken, user, ...session } = await this.auth.login(body.identifier, body.password);
    setRefreshCookie(reply, { accessToken, ...session });
    return { accessToken, user };
  }

  @Post('refresh')
  @HttpCode(200)
  public async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<RefreshResponse> {
    try {
      const session = await this.auth.refresh(request.cookies[REFRESH_COOKIE]);
      setRefreshCookie(reply, session);
      return { accessToken: session.accessToken };
    } catch (error) {
      void reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  public async logout(
    @Auth() auth: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(auth);
    this.realtime.revokeSession(auth.sessionId);
    void reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }
}
