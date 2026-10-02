import { healthResponseSchema } from '@financas/shared';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// HTTP test: the real module, routes and serialization; only the database is replaced.
describe('GET /health', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: () => Promise.resolve([]), $disconnect: () => Promise.resolve() })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with a body that honors the shared contract', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(healthResponseSchema.parse(response.body)).toEqual({ status: 'ok', database: 'up' });
  });
});
