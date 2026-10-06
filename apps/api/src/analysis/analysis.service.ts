import type { Analysis, AnalysisQuery, AnalysisRow } from '@financas/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Sums of a range of competências (ADR 0037): by competência, type and category, both of all the
 * transactions (planned) and of the settled ones. The page filters and shapes them with the pure
 * functions of `packages/shared/src/analysis.ts`. Nothing is stored; no description or single
 * amount leaves the database, only sums.
 */
@Injectable()
export class AnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  async get(workspaceId: string, { from, to }: AnalysisQuery): Promise<Analysis> {
    const db = this.prisma.forWorkspace(workspaceId);
    // Competências are `YYYY-MM`: as text they sort and compare like dates.
    const range = { workspaceId, period: { gte: from, lte: to } };
    const [planned, settled] = await Promise.all([
      db.transaction.groupBy({
        by: ['period', 'type', 'categoryId'],
        where: range,
        _sum: { amountCents: true },
      }),
      db.transaction.groupBy({
        by: ['period', 'type', 'categoryId'],
        where: { ...range, settledAt: { not: null } },
        _sum: { amountCents: true },
      }),
    ]);

    const key = (row: { period: string; type: string; categoryId: string }) =>
      `${row.period}|${row.type}|${row.categoryId}`;
    const settledByKey = new Map(settled.map((row) => [key(row), row._sum.amountCents ?? 0]));
    const rows: AnalysisRow[] = planned
      .map((row) => ({
        period: row.period,
        type: row.type,
        categoryId: row.categoryId,
        plannedCents: row._sum.amountCents ?? 0,
        settledCents: settledByKey.get(key(row)) ?? 0,
      }))
      .sort((a, b) => key(a).localeCompare(key(b)));
    return { from, to, rows };
  }
}
