import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The Prisma client as a Nest provider. It connects lazily on the first query, so the API
 * still boots while the database is asleep (Neon free plan, ADR 0009).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    });
  }

  /**
   * A client bound to one workspace, for the business tables protected by Row Level Security
   * (ADR 0028). Each query runs in its own transaction that first sets `app.workspace_id`; the
   * setting is transaction-local, so it never leaks to the next user of the pooled connection.
   *
   * Pass only the id validated by `WorkspaceMemberGuard` (`@CurrentMembership()`), and keep
   * filtering by `workspaceId` in the query: RLS is the second barrier, not the first.
   * Each call is already a transaction, so do not open `$transaction` on the returned client.
   */
  forWorkspace(workspaceId: string) {
    return this.$extends({
      query: {
        $allOperations: async ({ args, query }) => {
          const results: unknown[] = await this.$transaction([
            this.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`,
            query(args),
          ]);
          return results[1];
        },
      },
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
