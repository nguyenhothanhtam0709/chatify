import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import {
  SearchUsersQuerySchema,
  UpdateProfileRequestSchema,
  type MeResponse,
  type SearchUsersQuery,
  type SearchUsersResponse,
  type UpdateProfileRequest,
} from '@chat/contracts';
import { SearchThrottlerGuard } from '../throttling/app-throttler.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Auth, AuthGuard, type AuthContext } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  public async me(@Auth() auth: AuthContext): Promise<MeResponse> {
    return { user: await this.auth.getUser(auth.userId) };
  }

  /** Username-prefix search; rate limited to 30 per minute per User (see `ThrottlingModule`). */
  @Get('search')
  @UseGuards(AuthGuard, SearchThrottlerGuard)
  public async search(
    @Auth() auth: AuthContext,
    @Query(new ZodValidationPipe(SearchUsersQuerySchema)) query: SearchUsersQuery,
  ): Promise<SearchUsersResponse> {
    return { users: await this.auth.searchUsers(auth.userId, query.q) };
  }

  /** Sets or clears the Nickname and/or turns sharing read receipts on or off. */
  @Patch('me')
  @UseGuards(AuthGuard)
  public async updateMe(
    @Auth() auth: AuthContext,
    @Body(new ZodValidationPipe(UpdateProfileRequestSchema)) body: UpdateProfileRequest,
  ): Promise<MeResponse> {
    return { user: await this.auth.updateProfile(auth.userId, body) };
  }
}
