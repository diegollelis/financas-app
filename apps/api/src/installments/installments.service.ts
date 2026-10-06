import {
  currentPeriod,
  dueDateIn,
  installmentPlanTotal,
  shiftPeriod,
  splitInstallments,
  type CreateInstallmentPlanInput,
  type InstallmentPlan,
} from '@financas/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ensureUsableCategory } from '../categories/ensure-category.js';
import type { InstallmentPlan as PlanRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toDate } from '../transactions/dates.js';

function toResponse(plan: PlanRow, settledCount: number): InstallmentPlan {
  return {
    id: plan.id,
    type: plan.type,
    description: plan.description,
    notes: plan.notes,
    categoryId: plan.categoryId,
    totalCents: plan.totalCents,
    installments: plan.installments,
    firstPeriod: plan.firstPeriod,
    dueDay: plan.dueDay,
    endedAt: plan.endedAt?.toISOString() ?? null,
    settledCount,
  };
}

/**
 * Parcelamentos of one workspace (ADR 0038). Same rules as the other resources: the workspaceId
 * comes from WorkspaceMemberGuard, every query filters by it and runs through forWorkspace (RLS).
 * Descriptions and amounts are personal data: never log them (ADR 0012).
 */
@Injectable()
export class InstallmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Running ones first, then by description; each with how many were settled. */
  async list(workspaceId: string): Promise<InstallmentPlan[]> {
    const db = this.prisma.forWorkspace(workspaceId);
    const [plans, settled] = await Promise.all([
      db.installmentPlan.findMany({
        where: { workspaceId },
        orderBy: [{ endedAt: { sort: 'desc', nulls: 'first' } }, { description: 'asc' }],
      }),
      db.transaction.groupBy({
        by: ['installmentPlanId'],
        where: { workspaceId, installmentPlanId: { not: null }, settledAt: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const settledByPlan = new Map(
      settled.map((row) => [row.installmentPlanId, row._count._all] as const),
    );
    return plans.map((plan) => toResponse(plan, settledByPlan.get(plan.id) ?? 0));
  }

  /**
   * Creates the plan and all its installments in one nested write: one per competência from
   * the first on, pending, the last one with the cents the division leaves.
   */
  async create(workspaceId: string, input: CreateInstallmentPlanInput): Promise<InstallmentPlan> {
    await ensureUsableCategory(this.prisma, workspaceId, input.categoryId, input.type);
    const totalCents = installmentPlanTotal(input);
    const amounts = splitInstallments(totalCents, input.installments);
    const dueDay = input.dueDay ?? null;
    const plan = await this.prisma.forWorkspace(workspaceId).installmentPlan.create({
      data: {
        workspaceId,
        type: input.type,
        description: input.description,
        notes: input.notes ?? null,
        categoryId: input.categoryId,
        totalCents,
        installments: input.installments,
        firstPeriod: input.firstPeriod,
        dueDay,
        transactions: {
          create: amounts.map((amountCents, index) => {
            const period = shiftPeriod(input.firstPeriod, index);
            return {
              workspaceId,
              type: input.type,
              description: input.description,
              notes: input.notes ?? null,
              categoryId: input.categoryId,
              amountCents,
              period,
              dueDate: dueDay === null ? null : toDate(dueDateIn(period, dueDay)),
              installmentNumber: index + 1,
            };
          }),
        },
      },
    });
    return toResponse(plan, 0);
  }

  /**
   * Ends it (paid off early, or a mistake): the pending installments from this month on are
   * removed; settled ones and past months stay as history (ADR 0038). Ending twice changes
   * nothing.
   */
  async end(workspaceId: string, planId: string): Promise<void> {
    if (!z.uuid().safeParse(planId).success) throw new NotFoundException();
    const db = this.prisma.forWorkspace(workspaceId);
    const plan = await db.installmentPlan.findFirst({ where: { id: planId, workspaceId } });
    if (!plan) throw new NotFoundException();
    if (plan.endedAt) return;
    await db.transaction.deleteMany({
      where: {
        workspaceId,
        installmentPlanId: planId,
        settledAt: null,
        period: { gte: currentPeriod() },
      },
    });
    await db.installmentPlan.update({
      where: { id: planId, workspaceId },
      data: { endedAt: new Date() },
    });
  }
}
