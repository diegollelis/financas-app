import {
  DATA_EXPORT_FORMAT,
  DATA_EXPORT_VERSION,
  type DataExport,
  type OwnedWorkspaceExport,
} from '@financas/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { toIsoDate } from '../transactions/dates.js';

/**
 * Where each table with a workspace_id lands in the file (ADR 0041). A test reads the database
 * and fails when a table is missing here, so a new one is not left out of the export by mistake.
 */
export const EXPORTED_TABLES: Record<string, string> = {
  members: 'members',
  invitations: 'invitations',
  categories: 'categories',
  people: 'people',
  merchants: 'merchants',
  merchant_aliases: 'merchants[].aliases',
  cards: 'cards',
  transactions: 'transactions',
  budget_configs: 'budgets',
  budget_destinations: 'budgetDestinations',
  budget_shares: 'budgets[].shares',
  recurrences: 'recurrences',
  recurrence_occurrences: 'recurrences[].generatedPeriods',
  recurrence_shares: 'recurrences[].split',
  installment_plans: 'installmentPlans',
  imports: 'imports',
};

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => date && date.toISOString();
const dayOrNull = (date: Date | null) => date && toIsoDate(date);

/** The LGPD data export (ADR 0041). Read only; nothing about it is logged (ADR 0012). */
@Injectable()
export class DataExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportFor(userId: string): Promise<DataExport> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        accounts: { select: { providerId: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        sessions: {
          select: { createdAt: true, expiresAt: true, ipAddress: true, userAgent: true },
          orderBy: { createdAt: 'asc' },
        },
        memberships: { include: { workspace: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    const owned = user.memberships.filter((membership) => membership.role === 'OWNER');
    const shared = user.memberships.filter((membership) => membership.role !== 'OWNER');

    return {
      format: DATA_EXPORT_FORMAT,
      version: DATA_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: iso(user.createdAt),
        termsVersion: user.termsVersion,
        termsAcceptedAt: isoOrNull(user.termsAcceptedAt),
        logins: user.accounts.map((account) => ({
          provider: account.providerId,
          since: iso(account.createdAt),
        })),
        sessions: user.sessions.map((session) => ({
          createdAt: iso(session.createdAt),
          expiresAt: iso(session.expiresAt),
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
        })),
      },
      ownedWorkspaces: await Promise.all(
        owned.map(({ workspace }) => this.ownedWorkspace(workspace)),
      ),
      sharedWorkspaces: shared.map(({ workspace, role, createdAt }) => ({
        id: workspace.id,
        name: workspace.name,
        // Filtered above; the type does not know it.
        role: role === 'EDITOR' ? 'EDITOR' : 'VIEWER',
        since: iso(createdAt),
      })),
    };
  }

  /** A workspace the person owns, all of it. The business tables are read under RLS. */
  private async ownedWorkspace(workspace: {
    id: string;
    name: string;
    isPersonal: boolean;
    createdAt: Date;
  }): Promise<OwnedWorkspaceExport> {
    const workspaceId = workspace.id;
    const db = this.prisma.forWorkspace(workspaceId);
    const where = { workspaceId };
    const [
      members,
      invitations,
      categories,
      people,
      merchants,
      cards,
      transactions,
      budgets,
      budgetDestinations,
      recurrences,
      installmentPlans,
      imports,
    ] = await Promise.all([
      this.prisma.member.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.invitation.findMany({ where, orderBy: { createdAt: 'asc' } }),
      db.category.findMany({ where, orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
      db.person.findMany({ where, orderBy: { name: 'asc' } }),
      db.merchant.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { aliases: { orderBy: { alias: 'asc' }, select: { alias: true } } },
      }),
      db.card.findMany({ where, orderBy: { name: 'asc' } }),
      db.transaction.findMany({
        where,
        include: { occurrence: { select: { recurrenceId: true } } },
        orderBy: [{ period: 'asc' }, { createdAt: 'asc' }],
      }),
      db.budgetConfig.findMany({ where, include: { shares: true }, orderBy: { period: 'asc' } }),
      db.budgetDestination.findMany({
        where,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
      db.recurrence.findMany({
        where,
        include: {
          occurrences: { select: { period: true }, orderBy: { period: 'asc' } },
          shares: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.installmentPlan.findMany({ where, orderBy: { createdAt: 'asc' } }),
      db.transactionImport.findMany({ where, orderBy: { createdAt: 'asc' } }),
    ]);

    return {
      id: workspaceId,
      name: workspace.name,
      isPersonal: workspace.isPersonal,
      role: 'OWNER',
      createdAt: iso(workspace.createdAt),
      members: members.map((member) => ({
        name: member.user.name,
        email: member.user.email,
        role: member.role,
        since: iso(member.createdAt),
      })),
      // Never the token hash.
      invitations: invitations.map((invitation) => ({
        email: invitation.email,
        role: invitation.role,
        createdAt: iso(invitation.createdAt),
        expiresAt: iso(invitation.expiresAt),
        acceptedAt: isoOrNull(invitation.acceptedAt),
        removedAt: isoOrNull(invitation.removedAt),
        leftOnOwn: invitation.leftOnOwn,
      })),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        type: category.type,
        archivedAt: isoOrNull(category.archivedAt),
        splitRole: category.splitRole,
        neutral: category.neutral,
        returnCategoryId: category.returnCategoryId,
        createdAt: iso(category.createdAt),
      })),
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        description: transaction.description,
        notes: transaction.notes,
        categoryId: transaction.categoryId,
        amountCents: transaction.amountCents,
        amountEstimated: transaction.amountEstimated,
        period: transaction.period,
        dueDate: dayOrNull(transaction.dueDate),
        settledAt: dayOrNull(transaction.settledAt),
        occurredOn: dayOrNull(transaction.occurredOn),
        recurrenceId: transaction.occurrence?.recurrenceId ?? null,
        installmentPlanId: transaction.installmentPlanId,
        installmentNumber: transaction.installmentNumber,
        importId: transaction.importId,
        externalId: transaction.externalId,
        personId: transaction.personId,
        merchantId: transaction.merchantId,
        paymentMethod: transaction.paymentMethod,
        cardId: transaction.cardId,
        splitOfId: transaction.splitOfId,
        createdAt: iso(transaction.createdAt),
        updatedAt: iso(transaction.updatedAt),
      })),
      people: people.map((person) => ({
        id: person.id,
        name: person.name,
        memberUserId: person.memberUserId,
        archivedAt: isoOrNull(person.archivedAt),
        createdAt: iso(person.createdAt),
      })),
      merchants: merchants.map((merchant) => ({
        id: merchant.id,
        name: merchant.name,
        archivedAt: isoOrNull(merchant.archivedAt),
        aliases: merchant.aliases.map((item) => item.alias),
        createdAt: iso(merchant.createdAt),
      })),
      cards: cards.map((card) => ({
        id: card.id,
        name: card.name,
        bank: card.bank,
        functions: [
          ...(card.credit ? ['CREDIT' as const] : []),
          ...(card.debit ? ['DEBIT' as const] : []),
        ],
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        archivedAt: isoOrNull(card.archivedAt),
        createdAt: iso(card.createdAt),
      })),
      budgets: budgets.map((budget) => ({
        period: budget.period,
        netIncomeCents: budget.netIncomeCents,
        shares: budget.shares.map((share) => ({
          destinationId: share.destinationId,
          basisPoints: share.basisPoints,
        })),
        updatedAt: iso(budget.updatedAt),
      })),
      budgetDestinations: budgetDestinations.map((destination) => ({
        id: destination.id,
        name: destination.name,
        kind: destination.kind,
        position: destination.position,
        categoryId: destination.categoryId,
        archivedAt: isoOrNull(destination.archivedAt),
        createdAt: iso(destination.createdAt),
      })),
      recurrences: recurrences.map((recurrence) => ({
        id: recurrence.id,
        type: recurrence.type,
        description: recurrence.description,
        notes: recurrence.notes,
        categoryId: recurrence.categoryId,
        amountCents: recurrence.amountCents,
        variableAmount: recurrence.variableAmount,
        dueDay: recurrence.dueDay,
        dueMonthOffset: recurrence.dueMonthOffset,
        intervalMonths: recurrence.intervalMonths,
        personId: recurrence.personId,
        merchantId: recurrence.merchantId,
        paymentMethod: recurrence.paymentMethod,
        cardId: recurrence.cardId,
        startPeriod: recurrence.startPeriod,
        endPeriod: recurrence.endPeriod,
        generatedPeriods: recurrence.occurrences.map((occurrence) => occurrence.period),
        split: recurrence.shares.map(({ personId, amountCents, basisPoints }) => ({
          personId,
          amountCents,
          basisPoints,
        })),
        createdAt: iso(recurrence.createdAt),
      })),
      installmentPlans: installmentPlans.map((plan) => ({
        id: plan.id,
        type: plan.type,
        description: plan.description,
        notes: plan.notes,
        categoryId: plan.categoryId,
        totalCents: plan.totalCents,
        installments: plan.installments,
        firstNumber: plan.firstNumber,
        occurredOn: dayOrNull(plan.occurredOn),
        importId: plan.importId,
        firstPeriod: plan.firstPeriod,
        dueDay: plan.dueDay,
        dueMonthOffset: plan.dueMonthOffset,
        personId: plan.personId,
        merchantId: plan.merchantId,
        paymentMethod: plan.paymentMethod,
        cardId: plan.cardId,
        endedAt: isoOrNull(plan.endedAt),
        createdAt: iso(plan.createdAt),
      })),
      imports: imports.map((item) => ({
        id: item.id,
        transactionCount: item.transactionCount,
        label: item.label,
        statementDueDate: dayOrNull(item.statementDueDate),
        kind: item.kind,
        bank: item.bank,
        cardId: item.cardId,
        firstPeriod: item.firstPeriod,
        lastPeriod: item.lastPeriod,
        createdAt: iso(item.createdAt),
      })),
    };
  }
}
