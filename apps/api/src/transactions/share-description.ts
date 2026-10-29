import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * The pending shares of a split transaction take its new description (ADR 0052 note): a change
 * of the transaction itself, or of the recurrence or the plan that made it. Settled shares are
 * history and stay as they are.
 */
export async function followDescription(
  prisma: PrismaService,
  workspaceId: string,
  splitOfId: string,
  description: string,
): Promise<void> {
  await prisma.forWorkspace(workspaceId).transaction.updateMany({
    where: { workspaceId, splitOfId, settledAt: null },
    data: { description },
  });
}

/**
 * The pending shares take its new due date too (ADR 0052 note), from the same changes: what
 * the others owe falls due with the transaction they share.
 */
export async function followDueDate(
  prisma: PrismaService,
  workspaceId: string,
  splitOfId: string,
  dueDate: Date | null,
): Promise<void> {
  await followShares(prisma, workspaceId, splitOfId, { dueDate });
}

/**
 * The pending shares take the new dates of the transaction they share (ADR 0052 note, 0055),
 * and its competência when it moves to another month (ADR 0029 note).
 */
export async function followShares(
  prisma: PrismaService,
  workspaceId: string,
  splitOfId: string,
  dates: { dueDate?: Date | null; occurredOn?: Date | null; period?: string },
): Promise<void> {
  await prisma.forWorkspace(workspaceId).transaction.updateMany({
    where: { workspaceId, splitOfId, settledAt: null },
    data: dates,
  });
}
