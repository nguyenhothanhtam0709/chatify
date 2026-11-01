import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ErrorCode, type ErrorResponse } from '@chat/contracts';
import type { FastifyReply } from 'fastify';
import { ValidationFailedException } from './zod-validation.pipe.js';

/** Thrown by domain code to answer with a specific status and stable ErrorCode. */
export class DomainException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    status: HttpStatus,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message, status);
  }
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.UNAUTHENTICATED;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.RATE_LIMITED;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
}

/** Shape of Fastify's own errors (e.g. malformed JSON): they carry a 4xx `statusCode`. */
function fastifyClientStatus(exception: unknown): number | undefined {
  const status = (exception as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

/** Every error leaves the API as `{ error: { code, message, details? } }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  public catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const { status, body } = this.toResponse(exception);
    void reply.status(status).send(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorResponse } {
    if (exception instanceof ValidationFailedException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: {
            code: ErrorCode.VALIDATION_FAILED,
            message: 'Validation failed',
            details: exception.issues,
          },
        },
      };
    }
    if (exception instanceof DomainException) {
      return {
        status: exception.getStatus(),
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.details === undefined ? {} : { details: exception.details }),
          },
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: { error: { code: codeForStatus(status), message: exception.message } },
      };
    }
    const clientStatus = fastifyClientStatus(exception);
    if (clientStatus !== undefined) {
      return {
        status: clientStatus,
        body: {
          error: {
            code: codeForStatus(clientStatus),
            message: 'The request could not be processed',
          },
        },
      };
    }
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' } },
    };
  }
}
