import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  const queryRaw = vi.fn();
  // Unit test: a fake with only what the service uses replaces the real database.
  const service = new HealthService({ $queryRaw: queryRaw } as unknown as PrismaService);
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    queryRaw.mockReset();
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('reports ok when the database answers', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(service.check()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('reports degraded when the database fails', async () => {
    queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(service.check()).resolves.toEqual({ status: 'degraded', database: 'down' });
  });

  it('does not log the driver error message', async () => {
    queryRaw.mockRejectedValue(new Error('password authentication failed for user "secret"'));

    await service.check();

    expect(warn).toHaveBeenCalledWith(expect.not.stringContaining('secret'));
  });
});
