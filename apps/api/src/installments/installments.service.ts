import {
  currentPeriod,
  dueDateFor,
  dueMonthOffsetOf,
  MAX_DUE_MONTH_OFFSET,
  installmentPlanTotal,
  installmentsCreated,
  shareDescription,
  shiftPeriod,
  splitInstallments,
  INSTALLMENT_AMOUNT_FIELDS,
  type CreateInstallmentPlanInput,
  type InstallmentPlan,
  type InstallmentsFromTransactionInput,
  type SplitShareInput,
  type UpdateInstallmentPlanInput,
} from '@financas/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { ensureCardFits, ensureUsableCard } from '../cards/ensure-card.js';
import { ensureUsableCategory } from '../categories/ensure-category.js';
import { shareCategoryId } from '../categories/share-category.js';
import type { Prisma, InstallmentPlan as PlanRow } from '../generated/prisma/client.js';
import { ensureUsableMerchant } from '../merchants/ensure-merchant.js';
import { ensureUsablePerson, resolveSplitPerson } from '../people/ensure-person.js';
import { PrismaService, setWorkspaceContext } from '../prisma/prisma.service.js';
import { optionalDate, toDate, toIsoDate } from '../transactions/dates.js';
import {
  followDescription,
  followDueDate,
  followShares,
} from '../transactions/share-description.js';

type Pending = { count: number; cents: number; lastPeriod: string | null };

const NOTHING_PENDING: Pending = { count: 0, cents: 0, lastPeriod: null };

function toResponse(
  plan: PlanRow,
  settledCount: number,
  pending: Pending = NOTHING_PENDING,
  isSplit = false,
): InstallmentPlan {
  return {
    id: plan.id,
    type: plan.type,
    description: plan.description,
    notes: plan.notes,
    categoryId: plan.categoryId,
    totalCents: plan.totalCents,
    installments: plan.installments,
    firstNumber: plan.firstNumber,
    occurredOn: plan.occurredOn && toIsoDate(plan.occurredOn),
    firstPeriod: plan.firstPeriod,
    dueDay: plan.dueDay,
    dueMonthOffset: plan.dueMonthOffset,
    personId: plan.personId,
    merchantId: plan.merchantId,
    paymentMethod: plan.paymentMethod,
    cardId: plan.cardId,
    isSplit,
    endedAt: plan.endedAt?.toISOString() ?? null,
    adoptedTransactionId: plan.adoptedTransactionId,
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
    const [plans, settled, pending, shares] = await Promise.all([
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
      // One share per split plan is enough to know it is split.
      db.transaction.findMany({
        where: { workspaceId, splitOf: { is: { installmentPlanId: { not: null } } } },
        select: { splitOf: { select: { installmentPlanId: true } } },
      }),
    ]);
    const splitPlans = new Set(shares.map((share) => share.splitOf?.installmentPlanId));
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
      toResponse(
        plan,
        settledByPlan.get(plan.id) ?? 0,
        pendingByPlan.get(plan.id),
        splitPlans.has(plan.id),
      ),
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
    if (input.merchantId) await ensureUsableMerchant(this.prisma, workspaceId, input.merchantId);
    if (input.cardId) {
      await ensureUsableCard(this.prisma, workspaceId, input.cardId, input.paymentMethod);
    }
    const totalCents = installmentPlanTotal(input);
    // From the first number on (ADR 0055): a purchase at 3/10 gets installments 3 to 10.
    const firstNumber = input.firstNumber ?? 1;
    const amounts = splitInstallments(totalCents, installmentsCreated(input));
    const dueDay = input.dueDay ?? null;
    const dueMonthOffset = input.dueMonthOffset ?? 0;
    const personId = input.personId ?? null;
    const merchantId = input.merchantId ?? null;
    const paymentMethod = input.paymentMethod ?? null;
    const cardId = input.cardId ?? null;
    // The day of the purchase, the same on every installment and share (ADR 0055 note).
    const occurredOn = optionalDate(input.occurredOn) ?? null;
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
        firstNumber,
        occurredOn,
        firstPeriod: input.firstPeriod,
        dueDay,
        dueMonthOffset,
        personId,
        merchantId,
        paymentMethod,
        cardId,
        transactions: {
          create: amounts.map((amountCents, index) => {
            const period = shiftPeriod(input.firstPeriod, index);
            const dueDate =
              dueDay === null ? null : toDate(dueDateFor(period, dueDay, dueMonthOffset));
            return {
              workspaceId,
              type: input.type,
              description: input.description,
              notes: input.notes ?? null,
              categoryId: input.categoryId,
              personId,
              merchantId,
              paymentMethod,
              cardId,
              amountCents,
              period,
              dueDate,
              occurredOn,
              installmentNumber: firstNumber + index,
              ...(input.split && {
                shares: { create: sharesOf(index, period, dueDate, occurredOn) },
              }),
            };
          }),
        },
      },
    });
    // Just created: every installment is still to pay.
    return toResponse(
      plan,
      0,
      {
        count: amounts.length,
        cents: totalCents,
        lastPeriod: shiftPeriod(input.firstPeriod, amounts.length - 1),
      },
      Boolean(input.split),
    );
  }

  /**
   * "Tornar parcelado" (ADR 0038 note): the transaction becomes installment `firstNumber` of a
   * new plan that takes everything from it, in the same write that creates the plan and the next
   * installments, one per month after its own. Given as the total, its amount becomes its
   * installment's. One already in a plan or a recurrence, a share, a split one and a settled one
   * given as the total are refused.
   */
  async fromTransaction(
    workspaceId: string,
    input: InstallmentsFromTransactionInput,
  ): Promise<InstallmentPlan> {
    const db = this.prisma.forWorkspace(workspaceId);
    const transaction = await db.transaction.findFirst({
      where: { id: input.transactionId, workspaceId },
      include: { occurrence: true, _count: { select: { shares: true } } },
    });
    if (!transaction) throw new NotFoundException();
    const refuse = (message: string) => new ConflictException({ code: 'NOT_INSTALLABLE', message });
    if (transaction.installmentPlanId) {
      throw refuse('Este lançamento já é a parcela de um parcelamento.');
    }
    if (transaction.occurrence) throw refuse('Este lançamento é de uma recorrência.');
    if (transaction.splitOfId) throw refuse('Esta é a parte de uma divisão.');
    if (transaction._count.shares > 0) {
      throw refuse('Um lançamento dividido não vira parcelamento por aqui.');
    }
    if (transaction.settledAt && input.amountIs === 'TOTAL') {
      throw refuse(
        'Este lançamento já foi pago: informe o valor dele como o de uma parcela, que não muda.',
      );
    }
    // Each installment due as far from its competência as this one, a month at most.
    const dueIso = transaction.dueDate ? toIsoDate(transaction.dueDate) : null;
    const dueMonthOffset = dueIso ? dueMonthOffsetOf(transaction.period, dueIso) : 0;
    if (dueMonthOffset < 0 || dueMonthOffset > MAX_DUE_MONTH_OFFSET) {
      throw refuse('O vencimento deste lançamento fica longe demais do mês dele para parcelar.');
    }
    // What every installment will carry must still be usable.
    await ensureUsableCategory(this.prisma, workspaceId, transaction.categoryId, transaction.type);
    if (transaction.personId) {
      await ensureUsablePerson(this.prisma, workspaceId, transaction.personId);
    }
    if (transaction.merchantId) {
      await ensureUsableMerchant(this.prisma, workspaceId, transaction.merchantId);
    }
    if (transaction.cardId) {
      await ensureUsableCard(
        this.prisma,
        workspaceId,
        transaction.cardId,
        transaction.paymentMethod,
      );
    }
    const firstNumber = input.firstNumber ?? 1;
    const created = installmentsCreated({ installments: input.installments, firstNumber });
    const totalCents =
      input.amountIs === 'TOTAL' ? transaction.amountCents : transaction.amountCents * created;
    if (totalCents < created) throw refuse('O valor não dá um centavo por parcela.');
    const amounts = splitInstallments(totalCents, created);
    const dueDay = dueIso ? Number(dueIso.slice(8)) : null;
    const next = amounts.slice(1).map((amountCents, index) => {
      const period = shiftPeriod(transaction.period, index + 1);
      return {
        workspaceId,
        type: transaction.type,
        description: transaction.description,
        notes: transaction.notes,
        categoryId: transaction.categoryId,
        personId: transaction.personId,
        merchantId: transaction.merchantId,
        paymentMethod: transaction.paymentMethod,
        cardId: transaction.cardId,
        amountCents,
        period,
        dueDate: dueDay === null ? null : toDate(dueDateFor(period, dueDay, dueMonthOffset)),
        occurredOn: transaction.occurredOn,
        installmentNumber: firstNumber + index + 1,
      };
    });
    // One interactive transaction with the RLS context (ADR 0028): the plan with the next
    // installments, then this one adopted as its installment, or neither.
    const plan = await this.prisma.$transaction(async (tx) => {
      await setWorkspaceContext(tx, workspaceId);
      const created = await tx.installmentPlan.create({
        data: {
          workspaceId,
          type: transaction.type,
          description: transaction.description,
          notes: transaction.notes,
          categoryId: transaction.categoryId,
          totalCents,
          installments: input.installments,
          firstNumber,
          occurredOn: transaction.occurredOn,
          firstPeriod: transaction.period,
          dueDay,
          dueMonthOffset,
          personId: transaction.personId,
          merchantId: transaction.merchantId,
          paymentMethod: transaction.paymentMethod,
          cardId: transaction.cardId,
          // Given back as launched once, with this amount, if the plan is ended or deleted.
          adoptedTransactionId: transaction.id,
          adoptedAmountCents: transaction.amountCents,
          transactions: { create: next },
        },
      });
      await tx.transaction.update({
        where: { id: transaction.id, workspaceId },
        data: {
          amountCents: amounts[0],
          installmentPlanId: created.id,
          installmentNumber: firstNumber,
        },
      });
      return created;
    });
    const settled = transaction.settledAt ? 1 : 0;
    return toResponse(
      plan,
      settled,
      {
        count: amounts.length - settled,
        cents: settled ? totalCents - amounts[0]! : totalCents,
        lastPeriod: shiftPeriod(transaction.period, amounts.length - 1),
      },
      false,
    );
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
    const categoryId = await shareCategoryId(this.prisma, workspaceId, type, input.categoryId);
    const people = await Promise.all(
      split.map((share) => resolveSplitPerson(this.prisma, workspaceId, share)),
    );
    const count = input.installments;
    const created = installmentsCreated(input);
    const firstNumber = input.firstNumber ?? 1;
    const perInstallment = split.map((share) =>
      splitInstallments(
        input.amountIs === 'TOTAL' ? share.amountCents : share.amountCents * created,
        created,
      ),
    );
    return (index: number, period: string, dueDate: Date | null, occurredOn: Date | null) =>
      people.map((person, k) => ({
        workspaceId,
        type,
        // "Geladeira (3/10)": which installment it is a share of (ADR 0052 note).
        description: shareDescription(input.description, { number: firstNumber + index, count }),
        categoryId,
        amountCents: perInstallment[k]![index]!,
        period,
        // Due with its installment (ADR 0052 note), and of the same day (ADR 0055 note).
        dueDate,
        occurredOn,
        personId: person.id,
      }));
  }

  /**
   * Changes a running plan (ADR 0038 note). What it is (description, notes, category, person,
   * merchant, payment method, due day, day of the purchase) reaches the plan and its pending installments; settled
   * ones are history. The amounts remake every installment, as if it had just been created, and
   * so only while none is settled and it is not split.
   */
  async update(
    workspaceId: string,
    planId: string,
    input: UpdateInstallmentPlanInput,
  ): Promise<InstallmentPlan> {
    const plan = await this.find(workspaceId, planId);
    const db = this.prisma.forWorkspace(workspaceId);
    if (plan.endedAt) {
      throw new ConflictException({
        code: 'PLAN_ENDED',
        message: 'Um parcelamento encerrado não muda mais.',
      });
    }
    if (input.categoryId && input.categoryId !== plan.categoryId) {
      await ensureUsableCategory(this.prisma, workspaceId, input.categoryId, plan.type);
    }
    if (input.personId && input.personId !== plan.personId) {
      await ensureUsablePerson(this.prisma, workspaceId, input.personId);
    }
    if (input.merchantId && input.merchantId !== plan.merchantId) {
      await ensureUsableMerchant(this.prisma, workspaceId, input.merchantId);
    }
    // The card and the method after the change go together (ADR 0062).
    await ensureCardFits(this.prisma, workspaceId, plan, input);
    const [settledCount, sharesCount] = await Promise.all([
      db.transaction.count({
        where: { workspaceId, installmentPlanId: planId, settledAt: { not: null } },
      }),
      db.transaction.count({
        where: { workspaceId, splitOf: { is: { installmentPlanId: planId } } },
      }),
    ]);
    if (input.personId && sharesCount > 0) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Um lançamento dividido não fica ligado a uma só pessoa.',
      });
    }
    const merged = {
      description: input.description ?? plan.description,
      notes: input.notes === undefined ? plan.notes : input.notes,
      categoryId: input.categoryId ?? plan.categoryId,
      dueDay: input.dueDay === undefined ? plan.dueDay : input.dueDay,
      dueMonthOffset: input.dueMonthOffset ?? plan.dueMonthOffset,
      personId: input.personId === undefined ? plan.personId : input.personId,
      merchantId: input.merchantId === undefined ? plan.merchantId : input.merchantId,
      paymentMethod: input.paymentMethod === undefined ? plan.paymentMethod : input.paymentMethod,
      cardId: input.cardId === undefined ? plan.cardId : input.cardId,
      occurredOn: input.occurredOn === undefined ? plan.occurredOn : optionalDate(input.occurredOn),
    };
    const dueDateIn = (period: string) =>
      merged.dueDay === null
        ? null
        : toDate(dueDateFor(period, merged.dueDay, merged.dueMonthOffset));

    if (INSTALLMENT_AMOUNT_FIELDS.some((field) => input[field] !== undefined)) {
      if (settledCount > 0) {
        throw new ConflictException({
          code: 'PLAN_HAS_PAYMENTS',
          message: 'Com parcelas pagas, o valor não muda: encerre e crie outro parcelamento.',
        });
      }
      if (sharesCount > 0) {
        throw new ConflictException({
          code: 'PLAN_IS_SPLIT',
          message: 'O valor de um parcelamento dividido não muda: exclua e crie outro.',
        });
      }
      const installments = input.installments ?? plan.installments;
      const firstNumber = input.firstNumber ?? plan.firstNumber;
      if (firstNumber > installments) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: 'A parcela inicial passa do número de parcelas.',
        });
      }
      const created = installmentsCreated({ installments, firstNumber });
      const firstPeriod = input.firstPeriod ?? plan.firstPeriod;
      const totalCents =
        input.amountCents === undefined
          ? plan.totalCents
          : input.amountIs === 'TOTAL'
            ? input.amountCents
            : input.amountCents * created;
      if (totalCents < created) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: 'O total precisa dar ao menos um centavo por parcela.',
        });
      }
      // Nothing is settled: the installments are made again from scratch, the adopted one too
      // (it is no longer the transaction that existed before).
      await db.transaction.deleteMany({ where: { workspaceId, installmentPlanId: planId } });
      const amounts = splitInstallments(totalCents, created);
      const updated = await db.installmentPlan.update({
        where: { id: planId, workspaceId },
        data: {
          ...merged,
          totalCents,
          installments,
          firstNumber,
          firstPeriod,
          adoptedTransactionId: null,
          adoptedAmountCents: null,
          transactions: {
            create: amounts.map((amountCents, index) => {
              const period = shiftPeriod(firstPeriod, index);
              return {
                workspaceId,
                type: plan.type,
                description: merged.description,
                notes: merged.notes,
                categoryId: merged.categoryId,
                personId: merged.personId,
                merchantId: merged.merchantId,
                paymentMethod: merged.paymentMethod,
                cardId: merged.cardId,
                amountCents,
                period,
                dueDate: dueDateIn(period),
                occurredOn: merged.occurredOn,
                installmentNumber: firstNumber + index,
              };
            }),
          },
        },
      });
      return toResponse(updated, 0, {
        count: amounts.length,
        cents: totalCents,
        lastPeriod: shiftPeriod(firstPeriod, amounts.length - 1),
      });
    }

    const updated = await db.installmentPlan.update({
      where: { id: planId, workspaceId },
      data: merged,
    });
    const dueChanged = input.dueDay !== undefined || input.dueMonthOffset !== undefined;
    // A change of either the card or the method reaches the installments with both (ADR 0062).
    const cardChanged = input.cardId !== undefined || input.paymentMethod !== undefined;
    const pending = await db.transaction.findMany({
      where: { workspaceId, installmentPlanId: planId, settledAt: null },
      select: { id: true, period: true, installmentNumber: true },
    });
    for (const installment of pending) {
      const dueDate = dueChanged ? dueDateIn(installment.period) : undefined;
      await db.transaction.update({
        where: { id: installment.id, workspaceId },
        data: {
          description: input.description,
          notes: input.notes,
          categoryId: input.categoryId,
          personId: input.personId,
          merchantId: input.merchantId,
          paymentMethod: cardChanged ? merged.paymentMethod : undefined,
          cardId: cardChanged ? merged.cardId : undefined,
          dueDate,
          occurredOn: optionalDate(input.occurredOn),
        },
      });
      // Its pending shares fall due with it (ADR 0052 note) and take its day (ADR 0055 note).
      if (dueDate !== undefined) {
        await followDueDate(this.prisma, workspaceId, installment.id, dueDate);
      }
      if (input.occurredOn !== undefined) {
        await followShares(this.prisma, workspaceId, installment.id, {
          occurredOn: optionalDate(input.occurredOn),
        });
      }
      // Its pending shares take the new name, with their installment (ADR 0052 note).
      if (input.description !== undefined && installment.installmentNumber !== null) {
        await followDescription(
          this.prisma,
          workspaceId,
          installment.id,
          shareDescription(input.description, {
            number: installment.installmentNumber,
            count: plan.installments,
          }),
        );
      }
    }
    const list = await this.list(workspaceId);
    return list.find((item) => item.id === planId) ?? toResponse(updated, settledCount);
  }

  /**
   * Ends it (paid off early, or a mistake): the pending installments from this month on are
   * removed, with their shares still pending (ADR 0052); settled ones and past months stay as
   * history (ADR 0038). Ending twice changes nothing. With no installment settled there is no
   * history to keep: the plan goes with every installment, also the past months' (ADR 0038 note).
   */
  async end(workspaceId: string, planId: string): Promise<void> {
    const plan = await this.find(workspaceId, planId);
    const db = this.prisma.forWorkspace(workspaceId);
    const settled = await db.transaction.count({
      where: { workspaceId, installmentPlanId: planId, settledAt: { not: null } },
    });
    // The transaction it adopted ("Tornar parcelado") existed before it: still pending, it goes
    // back to being launched once, with its amount (ADR 0038 note). Ending a plan with payments
    // keeps its past months as history, so then only from this month on.
    if (plan.adoptedTransactionId) {
      await db.transaction.updateMany({
        where: {
          id: plan.adoptedTransactionId,
          workspaceId,
          installmentPlanId: planId,
          settledAt: null,
          ...(settled > 0 && { period: { gte: currentPeriod() } }),
        },
        data: {
          installmentPlanId: null,
          installmentNumber: null,
          ...(plan.adoptedAmountCents !== null && { amountCents: plan.adoptedAmountCents }),
        },
      });
    }
    if (settled === 0) {
      // The pending shares first (a settled one, money already received, stays unlinked); the
      // installments go with the plan, by cascade.
      await db.transaction.deleteMany({
        where: { workspaceId, settledAt: null, splitOf: { is: { installmentPlanId: planId } } },
      });
      await db.installmentPlan.delete({ where: { id: planId, workspaceId } });
      return;
    }
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

  private async find(workspaceId: string, planId: string): Promise<PlanRow> {
    if (!z.uuid().safeParse(planId).success) throw new NotFoundException();
    const plan = await this.prisma
      .forWorkspace(workspaceId)
      .installmentPlan.findFirst({ where: { id: planId, workspaceId } });
    if (!plan) throw new NotFoundException();
    return plan;
  }
}
