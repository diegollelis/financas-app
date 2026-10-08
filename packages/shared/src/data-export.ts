import { z } from 'zod';
import { transactionTypeSchema } from './category.ts';
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
  recurrenceId: z.uuid().nullable(),
  installmentPlanId: z.uuid().nullable(),
  installmentNumber: z.number().int().nullable(),
  importId: z.uuid().nullable(),
  /** A receber de / a pagar para this person, and the debit a share was split from. */
  personId: z.uuid().nullable(),
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

const exportBudgetSchema = z.object({
  period,
  netIncomeCents: z.number().int(),
  grossIncomeCents: z.number().int().nullable(),
  expensesBp: z.number().int(),
  investmentsBp: z.number().int(),
  emergencyReserveBp: z.number().int(),
  travelBp: z.number().int(),
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
  startPeriod: period,
  endPeriod: period.nullable(),
  /** The competências it already generated a transaction for. */
  generatedPeriods: z.array(period),
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
  firstPeriod: period,
  dueDay: z.number().int().nullable(),
  endedAt: instant.nullable(),
  createdAt: instant,
});

const exportImportSchema = z.object({
  id: z.uuid(),
  transactionCount: z.number().int(),
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
  transactions: z.array(exportTransactionSchema),
  budgets: z.array(exportBudgetSchema),
  recurrences: z.array(exportRecurrenceSchema),
  installmentPlans: z.array(exportInstallmentPlanSchema),
  imports: z.array(exportImportSchema),
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
