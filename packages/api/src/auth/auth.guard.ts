import {
  HttpStatus,
  createParamDecorator,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ErrorCode } from '@chat/contracts';
import type { FastifyRequest } from 'fastify';
import { DomainException } from '../common/all-exceptions.filter.js';
import { setRequestUserId } from '../logging/request-context.js';
import { AccessTokenAuthenticator, type AuthContext } from './access-token-authenticator.js';

export type { AuthContext };

type AuthedRequest = FastifyRequest & { auth?: AuthContext };

/** Requires a valid, unexpired access token in `Authorization: Bearer`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authenticator: AccessTokenAuthenticator) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const result = await this.authenticator.check(token);
    if (!result.ok) {
      throw result.code === ErrorCode.UNAUTHENTICATED
        ? new DomainException(
            ErrorCode.UNAUTHENTICATED,
            HttpStatus.UNAUTHORIZED,
            'Authentication required',
          )
        : new DomainException(
            ErrorCode.SESSION_REVOKED,
            HttpStatus.UNAUTHORIZED,
            'Session has ended',
          );
    }
    request.auth = result.auth;
    setRequestUserId(result.auth.userId);
    return true;
  }
}

/** The authenticated caller, set by `AuthGuard`. */
export const Auth = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<AuthedRequest>().auth;
});
