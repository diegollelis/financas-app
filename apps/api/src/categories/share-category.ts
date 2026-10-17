import type { SplitRole, TransactionType } from '@financas/shared';
import type { PrismaService } from '../prisma/prisma.service.js';

/** The credit category of the shares split from a debit (ADR 0042), a default one. */
export const REIMBURSEMENT_CATEGORY_NAME = 'Reembolso';

/** The debit category of the shares split from a credit (ADR 0052), a default one. */
export const PASS_THROUGH_CATEGORY_NAME = 'Repasse';

/**
 * The category of the shares of a split, on the side opposite the transaction: a debit's shares
 * are credits in Reembolso, a credit's are debits in Repasse. Found by its mark (ADR 0052 note),
 * which no route lets change. A workspace without it (it deleted or renamed one before the mark
 * existed) gets the one of that name marked, or a new one.
 */
export async function shareCategoryId(
  prisma: PrismaService,
  workspaceId: string,
  shareType: TransactionType,
): Promise<string> {
  const splitRole: SplitRole = shareType === 'CREDIT' ? 'REIMBURSEMENT' : 'PASS_THROUGH';
  const name = shareType === 'CREDIT' ? REIMBURSEMENT_CATEGORY_NAME : PASS_THROUGH_CATEGORY_NAME;
  const db = prisma.forWorkspace(workspaceId);
  const marked = await db.category.findFirst({ where: { workspaceId, splitRole } });
  if (marked) return marked.id;
  const named = await db.category.findFirst({
    where: { workspaceId, type: shareType, name: { equals: name, mode: 'insensitive' } },
  });
  if (named) {
    await db.category.update({
      where: { id: named.id },
      data: { splitRole, archivedAt: null },
    });
    return named.id;
  }
  const created = await db.category.create({
    data: { workspaceId, type: shareType, name, splitRole },
  });
  return created.id;
}
