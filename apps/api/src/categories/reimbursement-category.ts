import type { PrismaService } from '../prisma/prisma.service.js';

/** The credit category of the shares split from a debit (ADR 0042), a default one. */
export const REIMBURSEMENT_CATEGORY_NAME = 'Reembolso';

/**
 * The workspace's Reembolso category, for the shares of a split. Every workspace gets one, but
 * the person may have archived or deleted it: it is reactivated, or created again.
 */
export async function reimbursementCategoryId(
  prisma: PrismaService,
  workspaceId: string,
): Promise<string> {
  const db = prisma.forWorkspace(workspaceId);
  const where = {
    workspaceId,
    type: 'CREDIT' as const,
    name: { equals: REIMBURSEMENT_CATEGORY_NAME, mode: 'insensitive' as const },
  };
  const existing = await db.category.findFirst({ where });
  if (existing?.archivedAt) {
    await db.category.update({ where: { id: existing.id }, data: { archivedAt: null } });
  }
  if (existing) return existing.id;
  const created = await db.category.create({
    data: { workspaceId, type: 'CREDIT', name: REIMBURSEMENT_CATEGORY_NAME },
  });
  return created.id;
}
