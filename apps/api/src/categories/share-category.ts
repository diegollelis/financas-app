import type { TransactionType } from '@financas/shared';
import type { PrismaService } from '../prisma/prisma.service.js';

/** The credit category of the shares split from a debit (ADR 0042), a default one. */
export const REIMBURSEMENT_CATEGORY_NAME = 'Reembolso';

/** The debit category of the shares split from a credit (ADR 0052), a default one. */
export const PASS_THROUGH_CATEGORY_NAME = 'Repasse';

/**
 * The category of the shares of a split, on the side opposite the transaction: a debit's shares
 * are credits in Reembolso, a credit's are debits in Repasse. Every workspace gets both, but the
 * person may have archived or deleted one: it is reactivated, or created again.
 */
export async function shareCategoryId(
  prisma: PrismaService,
  workspaceId: string,
  shareType: TransactionType,
): Promise<string> {
  const name = shareType === 'CREDIT' ? REIMBURSEMENT_CATEGORY_NAME : PASS_THROUGH_CATEGORY_NAME;
  const db = prisma.forWorkspace(workspaceId);
  const where = {
    workspaceId,
    type: shareType,
    name: { equals: name, mode: 'insensitive' as const },
  };
  const existing = await db.category.findFirst({ where });
  if (existing?.archivedAt) {
    await db.category.update({ where: { id: existing.id }, data: { archivedAt: null } });
  }
  if (existing) return existing.id;
  const created = await db.category.create({ data: { workspaceId, type: shareType, name } });
  return created.id;
}
