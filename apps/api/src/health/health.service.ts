import type { HealthResponse } from '@financas/shared';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const databaseUp = await this.isDatabaseUp();
    return { status: databaseUp ? 'ok' : 'degraded', database: databaseUp ? 'up' : 'down' };
  }

  private async isDatabaseUp(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      // Only the error class: driver messages may carry connection details (ADR 0012).
      this.logger.warn(`Database health check failed (${(error as Error).name})`);
      return false;
    }
  }
}
