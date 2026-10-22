import { summarizePeriod, todayIso, type Summary } from '@financas/shared';
import { Injectable } from '@nestjs/common';
import { BudgetService } from '../budget/budget.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TransactionsService } from '../transactions/transactions.service.js';

/**
 * The month's dashboard (ADR 0031): read the competência's transactions and budget, then apply
 * the spreadsheet's formulas from `packages/shared`. Nothing is stored. Both services already
 * filter by the workspace and go through RLS.
 */
@Injectable()
export class SummaryService {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly budget: BudgetService,
    private readonly prisma: PrismaService,
  ) {}

  async get(workspaceId: string, period: string): Promise<Summary> {
    const [transactions, budget, neutral] = await Promise.all([
      this.transactions.list(workspaceId, period),
      this.budget.get(workspaceId, period),
      // "Nem renda nem gasto" (ADR 0056), archived ones too: old transactions keep them.
      this.prisma.forWorkspace(workspaceId).category.findMany({
        where: { workspaceId, neutral: true },
        select: { id: true },
      }),
    ]);
    // "Overdue" depends on today in São Paulo, not on the server's time zone (ADR 0010).
    return summarizePeriod(
      transactions,
      budget,
      todayIso(),
      new Set(neutral.map((category) => category.id)),
    );
  }
}
