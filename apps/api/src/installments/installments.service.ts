import {
  currentPeriod,
  dueDateIn,
  installmentPlanTotal,
  shareDescription,
  shiftPeriod,
  splitInstallments,
  type CreateInstallmentPlanInput,
  type InstallmentPlan,
  type SplitShareInput,
} from '@financas/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ensureUsableCategory } from '../categories/ensure-category.js';
import { shareCategoryId } from '../categories/share-category.js';
import type { Prisma, InstallmentPlan as PlanRow } from '../generated/prisma/client.js';
import { ensureUsablePerson, resolveSplitPerson } from '../people/ensure-person.js';
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
    personId: plan.personId,
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
   * the first on, pending, the last one with the cents the division leaves. A split plan
   * (ADR 0052) gives each installment one pending share per person, in the same write.
   */
  async create(workspaceId: string, input: CreateInstallmentPlanInput): Promise<InstallmentPlan> {
    await ensureUsableCategory(this.prisma, workspaceId, input.categoryId, input.type);
    if (input.personId) await ensureUsablePerson(this.prisma, workspaceId, input.personId);
    const totalCents = installmentPlanTotal(input);
    const amounts = splitInstallments(totalCents, input.installments);
    const dueDay = input.dueDay ?? null;
    const personId = input.personId ?? null;
    const sharesOf = input.split ? await this.shares(workspaceId, input, input.split) : () => [];
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
        personId,
        transactions: {
          create: amounts.map((amountCents, index) => {
            const period = shiftPeriod(input.firstPeriod, index);
            return {
              workspaceId,
              type: input.type,
              description: input.description,
              notes: input.notes ?? null,
              categoryId: input.categoryId,
              personId,
              amountCents,
              period,
              dueDate: dueDay === null ? null : toDate(dueDateIn(period, dueDay)),
              installmentNumber: index + 1,
              ...(input.split && { shares: { create: sharesOf(index, period) } }),
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
   * The shares of a split plan (ADR 0052), as a function of the installment: each person's
   * total, in the meaning of the amount typed, is divided like the installments themselves
   * (equal parts, the cents left over on the last), so it adds up exactly. They go on the side
   * opposite the plan: a debit's are credits in Reembolso, a credit's debits in Repasse.
   */
  private async shares(
    workspaceId: string,
    input: CreateInstallmentPlanInput,
    split: SplitShareInput[],
  ) {
    const type = input.type === 'DEBIT' ? ('CREDIT' as const) : ('DEBIT' as const);
    const categoryId = await shareCategoryId(this.prisma, workspaceId, type);
    const people = await Promise.all(
      split.map((share) => resolveSplitPerson(this.prisma, workspaceId, share)),
    );
    const count = input.installments;
    const perInstallment = split.map((share) =>
      splitInstallments(
        input.amountIs === 'TOTAL' ? share.amountCents : share.amountCents * count,
        count,
      ),
    );
    return (index: number, period: string) =>
      people.map((person, k) => ({
        workspaceId,
        type,
        // "Ana: parte de Geladeira (3/10)": which installment it is a share of.
        description: shareDescription(person.name, `${input.description} (${index + 1}/${count})`),
        categoryId,
        amountCents: perInstallment[k]![index]!,
        period,
        personId: person.id,
      }));
  }

  /**
   * Ends it (paid off early, or a mistake): the pending installments from this month on are
   * removed, with their shares still pending (ADR 0052); settled ones and past months stay as
   * history (ADR 0038). Ending twice changes nothing.
   */
  async end(workspaceId: string, planId: string): Promise<void> {
    if (!z.uuid().safeParse(planId).success) throw new NotFoundException();
    const db = this.prisma.forWorkspace(workspaceId);
    const plan = await db.installmentPlan.findFirst({ where: { id: planId, workspaceId } });
    if (!plan) throw new NotFoundException();
    if (plan.endedAt) return;
    const removed = {
      workspaceId,
      installmentPlanId: planId,
      settledAt: null,
      period: { gte: currentPeriod() },
    } satisfies Prisma.TransactionWhereInput;
    // Their pending shares first: deleting an installment would only unlink them (SET NULL).
    await db.transaction.deleteMany({
      where: { workspaceId, settledAt: null, splitOf: { is: removed } },
    });
    await db.transaction.deleteMany({ where: removed });
    await db.installmentPlan.update({
      where: { id: planId, workspaceId },
      data: { endedAt: new Date() },
    });
  }
}
