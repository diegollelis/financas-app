import {
  FULL_BASIS_POINTS,
  savingSharesTotal,
  type Budget,
  type BudgetInput,
  type BudgetShare,
} from '@financas/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { BudgetDestination } from '../generated/prisma/client.js';
import { PrismaService, setWorkspaceContext } from '../prisma/prisma.service.js';

/**
 * The destinations to show with a budget: every active one, in order, plus an archived one that
 * still has a share in it. A destination without a row in the budget has 0% (ADR 0047).
 */
function toShares(destinations: BudgetDestination[], saved: Map<string, number>): BudgetShare[] {
  return destinations
    .filter(
      (destination) => destination.archivedAt === null || (saved.get(destination.id) ?? 0) > 0,
    )
    .map((destination) => ({
      destinationId: destination.id,
      name: destination.name,
      kind: destination.kind,
      categoryId: destination.categoryId,
      basisPoints: saved.get(destination.id) ?? 0,
    }));
}

/**
 * Budget per competência (ADRs 0030, 0047): the net income and the share of each destination.
 * Only saved competências have a row; reading one that was not saved inherits the latest earlier
 * one, and with none at all the budget is empty (`NONE`): no default percentages. Same rules as
 * the other business tables: workspaceId from the guard, filter + forWorkspace (RLS). Incomes
 * are personal data: never log them (ADR 0012).
 */
@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  async get(workspaceId: string, period: string): Promise<Budget> {
    const db = this.prisma.forWorkspace(workspaceId);
    const [destinations, config] = await Promise.all([
      this.destinations(workspaceId),
      // `YYYY-MM` text sorts like the months it stands for: the latest at or before this one.
      db.budgetConfig.findFirst({
        where: { workspaceId, period: { lte: period } },
        orderBy: { period: 'desc' },
        include: { shares: true },
      }),
    ]);
    if (!config) {
      return {
        period,
        netIncomeCents: 0,
        source: 'NONE',
        inheritedFrom: null,
        shares: toShares(destinations, new Map()),
      };
    }
    const saved = new Map(config.shares.map((share) => [share.destinationId, share.basisPoints]));
    const own = config.period === period;
    return {
      period,
      netIncomeCents: config.netIncomeCents,
      source: own ? 'SAVED' : 'INHERITED',
      inheritedFrom: own ? null : config.period,
      shares: toShares(destinations, saved),
    };
  }

  /**
   * Saves the competência's own budget, replacing its shares; the next competências inherit it
   * until they save theirs. Every destination must be the workspace's, and the saving ones add
   * up to at most 100% of what is left after expenses.
   */
  async save(workspaceId: string, period: string, input: BudgetInput): Promise<Budget> {
    const destinations = await this.destinations(workspaceId);
    const byId = new Map(destinations.map((destination) => [destination.id, destination]));
    const shares = input.shares.map((share) => {
      const destination = byId.get(share.destinationId);
      if (!destination) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: 'Um dos destinos não existe neste espaço.',
        });
      }
      return { ...share, kind: destination.kind };
    });
    if (savingSharesTotal(shares) > FULL_BASIS_POINTS) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'A soma dos destinos de guardar não pode passar de 100%.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await setWorkspaceContext(tx, workspaceId);
      const config = await tx.budgetConfig.upsert({
        where: { workspaceId_period: { workspaceId, period } },
        create: { workspaceId, period, netIncomeCents: input.netIncomeCents },
        update: { netIncomeCents: input.netIncomeCents },
      });
      await tx.budgetShare.deleteMany({ where: { budgetConfigId: config.id } });
      await tx.budgetShare.createMany({
        data: input.shares.map((share) => ({
          workspaceId,
          budgetConfigId: config.id,
          destinationId: share.destinationId,
          basisPoints: share.basisPoints,
        })),
      });
    });
    return this.get(workspaceId, period);
  }

  private destinations(workspaceId: string) {
    return this.prisma.forWorkspace(workspaceId).budgetDestination.findMany({
      where: { workspaceId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }
}
