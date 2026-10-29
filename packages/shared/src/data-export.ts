import { z } from 'zod';
import { splitRoleSchema, transactionTypeSchema } from './category.ts';
import { paymentMethodSchema } from './payment-method.ts';
import { workspaceRoleSchema } from './workspace.ts';

/**
 * The file of `GET /me/export` (ADR 0041): everything the app keeps about the person, for the
 * LGPD access and portability rights. Values as stored: amounts in integer cents, percentages in
 * basis points, competências as YYYY-MM, dates as YYYY-MM-DD and instants in ISO 8601 (UTC).
 * Never tokens, password hashes or invitation token hashes.
 */
export const DATA_EXPORT_FORMAT = 'financas-dados';
export const DATA_EXPORT_VERSION = 1;

const instant = z.iso.datetime();
const day = z.iso.date();
const period = z.string().regex(/^\d{4}-\d{2}$/);

const exportCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: transactionTypeSchema,
  archivedAt: instant.nullable(),
  /** Reembolso or Repasse (ADR 0052 note); null for the others. */
  splitRole: splitRoleSchema.nullable(),
  /** "Nem renda nem gasto" (ADR 0056). */
  neutral: z.boolean(),
  /** Where the money lent comes back (ADR 0058); null for the others. */
  returnCategoryId: z.uuid().nullable().default(null),
  createdAt: instant,
});

const exportTransactionSchema = z.object({
  id: z.uuid(),
  type: transactionTypeSchema,
  description: z.string(),
  notes: z.string().nullable(),
  categoryId: z.uuid(),
  amountCents: z.number().int(),
  amountEstimated: z.boolean(),
  period,
  dueDate: day.nullable(),
  settledAt: day.nullable(),
  /** The day it happened (ADR 0055). */
  occurredOn: day.nullable(),
  recurrenceId: z.uuid().nullable(),
  installmentPlanId: z.uuid().nullable(),
  installmentNumber: z.number().int().nullable(),
  importId: z.uuid().nullable(),
  /** The bank's movement it is (ADR 0061), "NUBANK:<id>"; null for one launched otherwise. */
  externalId: z.string().nullable().default(null),
  /** A receber de / a pagar para this person, and the debit a share was split from. */
  personId: z.uuid().nullable(),
  /** Where it was bought or who paid it (ADR 0053). */
  merchantId: z.uuid().nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  /** The card it was paid or received with (ADR 0062). */
  cardId: z.uuid().nullable().default(null),
  splitOfId: z.uuid().nullable(),
  createdAt: instant,
  updatedAt: instant,
});

const exportPersonSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Linked to this member's account (by id), while it was one. */
  memberUserId: z.uuid().nullable(),
  archivedAt: instant.nullable(),
  createdAt: instant,
});

/** Where transactions were bought or who paid them (ADR 0053). */
const exportMerchantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  archivedAt: instant.nullable(),
  /** How it appears in card statements (ADR 0055). */
  aliases: z.array(z.string()),
  createdAt: instant,
});

/** The cards of the Crédito and Débito methods (ADR 0062), with the days of the bill. */
const exportCardSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  bank: z.enum(['NUBANK']).nullable(),
  functions: z.array(z.enum(['CREDIT', 'DEBIT'])),
  closingDay: z.number().int().nullable(),
  dueDay: z.number().int().nullable(),
  archivedAt: instant.nullable(),
  createdAt: instant,
});

/**
 * A closing of a competência (ADR 0063), with who closed and reopened it by name (null once that
 * account is gone) and why it was reopened.
 */
const exportPeriodClosingSchema = z.object({
  period: z.string(),
  closedAt: instant,
  closedBy: z.string().nullable(),
  reopenedAt: instant.nullable(),
  reopenedBy: z.string().nullable(),
  reopenReason: z.string().nullable(),
});

/** A destination of the budget (ADR 0047), with the category of its applications. */
const exportBudgetDestinationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(['EXPENSES', 'SAVINGS']),
  position: z.number().int(),
  categoryId: z.uuid().nullable(),
  archivedAt: instant.nullable(),
  createdAt: instant,
});

const exportBudgetSchema = z.object({
  period,
  netIncomeCents: z.number().int(),
  /** The share of each destination, in basis points (ADR 0047); one left out had 0%. */
  shares: z.array(z.object({ destinationId: z.uuid(), basisPoints: z.number().int() })),
  updatedAt: instant,
});

const exportRecurrenceSchema = z.object({
  id: z.uuid(),
  type: transactionTypeSchema,
  description: z.string(),
  notes: z.string().nullable(),
  categoryId: z.uuid(),
  amountCents: z.number().int(),
  variableAmount: z.boolean(),
  dueDay: z.number().int().nullable(),
  dueMonthOffset: z.number().int(),
  intervalMonths: z.number().int(),
  personId: z.uuid().nullable(),
  merchantId: z.uuid().nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  cardId: z.uuid().nullable().default(null),
  startPeriod: period,
  endPeriod: period.nullable(),
  /** The competências it already generated a transaction for. */
  generatedPeriods: z.array(period),
  /** Who shares it (ADR 0052): a fixed amount or a percentage (basis points) each. */
  split: z.array(
    z.object({
      personId: z.uuid(),
      amountCents: z.number().int().nullable(),
      basisPoints: z.number().int().nullable(),
    }),
  ),
  createdAt: instant,
});

const exportInstallmentPlanSchema = z.object({
  id: z.uuid(),
  type: transactionTypeSchema,
  description: z.string(),
  notes: z.string().nullable(),
  categoryId: z.uuid(),
  totalCents: z.number().int(),
  installments: z.number().int(),
  firstNumber: z.number().int(),
  occurredOn: day.nullable(),
  importId: z.uuid().nullable(),
  firstPeriod: period,
  dueDay: z.number().int().nullable(),
  dueMonthOffset: z.number().int(),
  personId: z.uuid().nullable(),
  merchantId: z.uuid().nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  cardId: z.uuid().nullable().default(null),
  endedAt: instant.nullable(),
  createdAt: instant,
});

const exportImportSchema = z.object({
  id: z.uuid(),
  transactionCount: z.number().int(),
  label: z.string().nullable(),
  statementDueDate: day.nullable(),
  /** What it brought and from which bank (ADR 0060). */
  kind: z.enum(['TEMPLATE', 'CARD_STATEMENT', 'ACCOUNT_STATEMENT']).default('TEMPLATE'),
  bank: z.enum(['NUBANK']).nullable().default(null),
  /** The card whose statement it was (ADR 0062). */
  cardId: z.uuid().nullable().default(null),
  firstPeriod: period,
  lastPeriod: period,
  createdAt: instant,
});

const exportMemberSchema = z.object({
  name: z.string(),
  email: z.email(),
  role: workspaceRoleSchema,
  since: instant,
});

const exportInvitationSchema = z.object({
  email: z.string(),
  role: workspaceRoleSchema,
  createdAt: instant,
  expiresAt: instant,
  acceptedAt: instant.nullable(),
  /** When the membership it gave ended, and whether the person left on their own. */
  removedAt: instant.nullable(),
  leftOnOwn: z.boolean(),
});

/** A workspace the person owns: all of it. */
const ownedWorkspaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isPersonal: z.boolean(),
  role: z.literal('OWNER'),
  createdAt: instant,
  members: z.array(exportMemberSchema),
  invitations: z.array(exportInvitationSchema),
  categories: z.array(exportCategorySchema),
  people: z.array(exportPersonSchema),
  merchants: z.array(exportMerchantSchema),
  cards: z.array(exportCardSchema).default([]),
  transactions: z.array(exportTransactionSchema),
  budgets: z.array(exportBudgetSchema),
  budgetDestinations: z.array(exportBudgetDestinationSchema),
  recurrences: z.array(exportRecurrenceSchema),
  installmentPlans: z.array(exportInstallmentPlanSchema),
  imports: z.array(exportImportSchema),
  periodClosings: z.array(exportPeriodClosingSchema).default([]),
});

/** A workspace of someone else: only the participation; its data belongs to its owner. */
const sharedWorkspaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: workspaceRoleSchema.exclude(['OWNER']),
  since: instant,
});

export const dataExportSchema = z.object({
  format: z.literal(DATA_EXPORT_FORMAT),
  version: z.literal(DATA_EXPORT_VERSION),
  exportedAt: instant,
  account: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    createdAt: instant,
    termsVersion: z.string().nullable(),
    termsAcceptedAt: instant.nullable(),
    /** How the person signs in: "credential" (e-mail and password), "google". */
    logins: z.array(z.object({ provider: z.string(), since: instant })),
    /** Open sessions, with the IP and browser the app keeps for security. */
    sessions: z.array(
      z.object({
        createdAt: instant,
        expiresAt: instant,
        ipAddress: z.string().nullable(),
        userAgent: z.string().nullable(),
      }),
    ),
  }),
  ownedWorkspaces: z.array(ownedWorkspaceSchema),
  sharedWorkspaces: z.array(sharedWorkspaceSchema),
});

export type DataExport = z.infer<typeof dataExportSchema>;
export type OwnedWorkspaceExport = z.infer<typeof ownedWorkspaceSchema>;
