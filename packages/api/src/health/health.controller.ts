import { Controller, Get, HttpCode, Inject, Res } from '@nestjs/common';
import type { HealthResponse } from '@chat/contracts';
import type { FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/database.module.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  @HttpCode(200)
  public async check(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthResponse> {
    try {
      await this.pool.query('select 1');
      return { status: 'ok', database: 'up' };
    } catch {
      reply.status(503);
      return { status: 'error', database: 'down' };
    }
  }
}
