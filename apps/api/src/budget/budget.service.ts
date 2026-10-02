import { DEFAULT_BUDGET_SHARES, type Budget, type BudgetInput } from '@financas/shared';
import { Injectable } from '@nestjs/common';
import type { BudgetConfig } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

function fromRow(row: BudgetConfig) {
  return {
    netIncomeCents: row.netIncomeCents,
    grossIncomeCents: row.grossIncomeCents,
    expensesBp: row.expensesBp,
    investmentsBp: row.investmentsBp,
    emergencyReserveBp: row.emergencyReserveBp,
    travelBp: row.travelBp,
  };
}

/**
 * Budget configuration per competência (ADR 0030). Only saved competências have a row; reading
 * one that was not saved inherits the latest earlier one, so reading never writes. Same rules as
 * the other business tables: workspaceId from the guard, filter + forWorkspace (RLS).
 * Incomes are personal data: never log them (ADR 0012).
 */
@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  async get(workspaceId: string, period: string): Promise<Budget> {
    const db = this.prisma.forWorkspace(workspaceId);
    const saved = await db.budgetConfig.findUnique({
      where: { workspaceId_period: { workspaceId, period } },
    });
    if (saved) return { period, ...fromRow(saved), source: 'SAVED', inheritedFrom: null };

    // `YYYY-MM` text sorts like the months it stands for.
    const previous = await db.budgetConfig.findFirst({
      where: { workspaceId, period: { lt: period } },
      orderBy: { period: 'desc' },
    });
    if (previous) {
      return { period, ...fromRow(previous), source: 'INHERITED', inheritedFrom: previous.period };
    }

    return {
      period,
      netIncomeCents: 0,
      grossIncomeCents: null,
      ...DEFAULT_BUDGET_SHARES,
      source: 'DEFAULT',
      inheritedFrom: null,
    };
  }

  /** Saves the competência's own configuration; the next ones inherit it until they save theirs. */
  async save(workspaceId: string, period: string, input: BudgetInput): Promise<Budget> {
    const row = await this.prisma.forWorkspace(workspaceId).budgetConfig.upsert({
      where: { workspaceId_period: { workspaceId, period } },
      create: { workspaceId, period, ...input },
      update: input,
    });
    return { period, ...fromRow(row), source: 'SAVED', inheritedFrom: null };
  }
}
