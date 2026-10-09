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

type Pending = { count: number; cents: number; lastPeriod: string | null };

const NOTHING_PENDING: Pending = { count: 0, cents: 0, lastPeriod: null };

function toResponse(
  plan: PlanRow,
  settledCount: number,
  pending: Pending = NOTHING_PENDING,
): InstallmentPlan {
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
    pendingCount: pending.count,
    pendingCents: pending.cents,
    lastPendingPeriod: pending.lastPeriod,
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

  /** Running ones first, then by description; each with what was settled and what is left. */
  async list(workspaceId: string): Promise<InstallmentPlan[]> {
    const db = this.prisma.forWorkspace(workspaceId);
    const [plans, settled, pending] = await Promise.all([
      db.installmentPlan.findMany({
        where: { workspaceId },
        orderBy: [{ endedAt: { sort: 'desc', nulls: 'first' } }, { description: 'asc' }],
      }),
      db.transaction.groupBy({
        by: ['installmentPlanId'],
        where: { workspaceId, installmentPlanId: { not: null }, settledAt: { not: null } },
        _count: { _all: true },
      }),
      db.transaction.groupBy({
        by: ['installmentPlanId'],
        where: { workspaceId, installmentPlanId: { not: null }, settledAt: null },
        _count: { _all: true },
        _sum: { amountCents: true },
        _max: { period: true },
      }),
    ]);
    const settledByPlan = new Map(
      settled.map((row) => [row.installmentPlanId, row._count._all] as const),
    );
    const pendingByPlan = new Map(
      pending.map(
        (row) =>
          [
            row.installmentPlanId,
            {
              count: row._count._all,
              cents: row._sum.amountCents ?? 0,
              lastPeriod: row._max.period,
            },
          ] as const,
      ),
    );
    return plans.map((plan) =>
      toResponse(plan, settledByPlan.get(plan.id) ?? 0, pendingByPlan.get(plan.id)),
    );
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
    // Just created: every installment is still to pay.
    return toResponse(plan, 0, {
      count: amounts.length,
      cents: totalCents,
      lastPeriod: shiftPeriod(input.firstPeriod, amounts.length - 1),
    });
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
