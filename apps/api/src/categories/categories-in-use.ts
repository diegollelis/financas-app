import type { PrismaService } from '../prisma/prisma.service.js';

type WorkspaceDb = ReturnType<PrismaService['forWorkspace']>;

/**
 * The categories with anything in them, in any competência: transactions, recurrences or
 * installment plans. Their foreign keys refuse to delete such a category, so only the others are
 * offered for deletion (a category never used, a destination never applied to).
 */
export async function categoriesInUse(db: WorkspaceDb, workspaceId: string): Promise<Set<string>> {
  const where = { workspaceId };
  const select = { categoryId: true } as const;
  const [transactions, recurrences, plans] = await Promise.all([
    db.transaction.findMany({ where, select, distinct: ['categoryId'] }),
    db.recurrence.findMany({ where, select, distinct: ['categoryId'] }),
    db.installmentPlan.findMany({ where, select, distinct: ['categoryId'] }),
  ]);
  return new Set([...transactions, ...recurrences, ...plans].map((row) => row.categoryId));
}

/** The same answer for one category, without reading the others. */
export async function categoryInUse(
  db: WorkspaceDb,
  workspaceId: string,
  categoryId: string,
): Promise<boolean> {
  const where = { workspaceId, categoryId };
  const found = await Promise.all([
    db.transaction.findFirst({ where, select: { id: true } }),
    db.recurrence.findFirst({ where, select: { id: true } }),
    db.installmentPlan.findFirst({ where, select: { id: true } }),
  ]);
  return found.some((row) => row !== null);
}
