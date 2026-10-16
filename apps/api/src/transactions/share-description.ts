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
