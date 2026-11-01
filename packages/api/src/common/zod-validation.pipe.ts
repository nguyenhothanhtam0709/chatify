import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Carries the Zod issues so the global filter can put them in `details`. */
export class ValidationFailedException extends BadRequestException {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super('Validation failed');
  }
}

/**
 * Validates a body, param or query string against a contracts schema and hands the
 * parsed value to the handler. The one validation mechanism in the API.
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  public transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationFailedException(result.error.issues);
    }
    return result.data;
  }
}
