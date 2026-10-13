import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

const invalidMerchant = (message: string) =>
  new BadRequestException({ code: 'INVALID_MERCHANT', message });

/**
 * A transaction, recurrence or installment plan may name only a merchant of the same workspace
 * (the composite foreign key also refuses it) that is not archived (ADR 0053). Checked first for
 * a clear pt-BR answer.
 */
export async function ensureUsableMerchant(
  prisma: PrismaService,
  workspaceId: string,
  merchantId: string,
) {
  const merchant = await prisma
    .forWorkspace(workspaceId)
    .merchant.findFirst({ where: { id: merchantId, workspaceId } });
  if (!merchant) throw invalidMerchant('Estabelecimento não encontrado neste espaço.');
  if (merchant.archivedAt) {
    throw invalidMerchant('Este estabelecimento está arquivado. Reative-o ou escolha outro.');
  }
  return merchant;
}
