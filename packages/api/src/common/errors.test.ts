import 'reflect-metadata';
import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ErrorCode, ErrorResponseSchema } from '@chat/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { withApp } from '../../test/app-harness.js';
import { ErrorsModule } from './errors.module.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const BodySchema = z.object({ name: z.string().min(1), age: z.number().int() });
const ParamSchema = z.object({ id: z.uuid() });
const QuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100) });

@Controller('probe')
class ProbeController {
  @Post()
  public create(@Body(new ZodValidationPipe(BodySchema)) body: z.infer<typeof BodySchema>) {
    return body;
  }

  @Get('boom')
  public boom(): never {
    throw new Error('database password is hunter2');
  }

  @Get('list')
  public list(@Query(new ZodValidationPipe(QuerySchema)) query: z.infer<typeof QuerySchema>) {
    return query;
  }

  @Get(':id')
  public get(@Param(new ZodValidationPipe(ParamSchema)) params: z.infer<typeof ParamSchema>) {
    return params;
  }
}

@Module({ imports: [ErrorsModule], controllers: [ProbeController] })
class ProbeModule {}

let probe: NestFastifyApplication | undefined;

async function probeApp(): Promise<NestFastifyApplication> {
  probe = await NestFactory.create<NestFastifyApplication>(ProbeModule, new FastifyAdapter(), {
    logger: false,
  });
  await probe.init();
  await probe.getHttpAdapter().getInstance().ready();
  return probe;
}

afterEach(async () => {
  await probe?.close();
  probe = undefined;
});

describe('validation failures', () => {
  it('maps an invalid body to 400 VALIDATION_FAILED with Zod issues in details', async () => {
    const app = await probeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/probe',
      payload: { name: '', age: 1.5 },
    });

    expect(res.statusCode).toBe(400);
    const body = ErrorResponseSchema.parse(res.json());
    expect(body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    const paths = (body.error.details as { path: string[] }[]).map((i) => i.path.join('.'));
    expect(paths.sort()).toEqual(['age', 'name']);
  });

  it('accepts a valid body and passes the parsed value through', async () => {
    const app = await probeApp();
    const res = await app.inject({ method: 'POST', url: '/probe', payload: { name: 'a', age: 3 } });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ name: 'a', age: 3 });
  });

  it('validates path params', async () => {
    const app = await probeApp();
    const res = await app.inject({ method: 'GET', url: '/probe/not-a-uuid' });

    expect(res.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(res.json()).error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('validates and coerces query strings', async () => {
    const app = await probeApp();

    const bad = await app.inject({ method: 'GET', url: '/probe/list?limit=0' });
    expect(bad.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(bad.json()).error.code).toBe(ErrorCode.VALIDATION_FAILED);

    const good = await app.inject({ method: 'GET', url: '/probe/list?limit=5' });
    expect(good.json()).toEqual({ limit: 5 });
  });

  it('maps malformed JSON to 400 VALIDATION_FAILED', async () => {
    const app = await probeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/probe',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });

    expect(res.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(res.json()).error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });
});

describe('unknown errors', () => {
  it('maps to 500 INTERNAL_ERROR without leaking internals', async () => {
    const app = await probeApp();
    const res = await app.inject({ method: 'GET', url: '/probe/boom' });

    expect(res.statusCode).toBe(500);
    const body = ErrorResponseSchema.parse(res.json());
    expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(body.error.details).toBeUndefined();
    expect(res.body).not.toContain('hunter2');
  });
});

describe('the real app', () => {
  it('returns the error shape for an unknown route', async () => {
    await withApp({}, async (app) => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });

      expect(res.statusCode).toBe(404);
      expect(ErrorResponseSchema.safeParse(res.json()).success).toBe(true);
    });
  });
});
