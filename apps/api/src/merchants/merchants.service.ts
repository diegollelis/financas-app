import {
  normalizeName,
  normalizeStatementTitle,
  type CreateMerchantAliasInput,
  type CreateMerchantInput,
  type Merchant,
  type UpdateMerchantInput,
} from '@financas/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type Merchant as MerchantRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Sorts names as a Brazilian reader expects ("Água Viva" next to "Açougue"). */
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

const merchantExists = () =>
  new ConflictException({
    code: 'MERCHANT_EXISTS',
    message: 'Já existe um estabelecimento com esse nome. Se ele estiver arquivado, reative-o.',
  });

const aliasExists = (merchantName: string | null) =>
  new ConflictException({
    code: 'MERCHANT_ALIAS_EXISTS',
    message: merchantName
      ? `Esse apelido já é de "${merchantName}".`
      : 'Esse apelido já é de outro estabelecimento.',
  });

/** What tells whether a merchant is used, counted with it, and its aliases (ADR 0055). */
const withUses = {
  _count: { select: { transactions: true, recurrences: true, installmentPlans: true } },
  aliases: { select: { id: true, alias: true } },
} as const;

type MerchantWithUses = MerchantRow & {
  _count: { transactions: number; recurrences: number; installmentPlans: number };
  aliases: { id: string; alias: string }[];
};

function isPrismaError(error: unknown, code: 'P2002' | 'P2003' | 'P2025') {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function toResponse(merchant: MerchantWithUses): Merchant {
  const uses = merchant._count;
  return {
    id: merchant.id,
    name: merchant.name,
    archived: merchant.archivedAt !== null,
    inUse: uses.transactions + uses.recurrences + uses.installmentPlans > 0,
    aliases: [...merchant.aliases].sort((a, b) => collator.compare(a.alias, b.alias)),
  };
}

/**
 * Merchants of one workspace (ADR 0053): where a transaction was bought or who paid it. Same
 * rules as people: the workspaceId comes from WorkspaceMemberGuard and every query runs through
 * forWorkspace (RLS).
 */
@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  /** All of them, archived too, by name. */
  async list(workspaceId: string): Promise<Merchant[]> {
    const merchants = await this.prisma
      .forWorkspace(workspaceId)
      .merchant.findMany({ where: { workspaceId }, include: withUses });
    return merchants.map(toResponse).sort((a, b) => collator.compare(a.name, b.name));
  }

  async create(workspaceId: string, input: CreateMerchantInput): Promise<Merchant> {
    await this.ensureNameIsFree(workspaceId, input.name);
    try {
      const merchant = await this.prisma
        .forWorkspace(workspaceId)
        .merchant.create({ data: { workspaceId, name: input.name }, include: withUses });
      return toResponse(merchant);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw merchantExists();
      throw error;
    }
  }

  async update(
    workspaceId: string,
    merchantId: string,
    input: UpdateMerchantInput,
  ): Promise<Merchant> {
    const current = await this.find(workspaceId, merchantId);
    if (input.name !== undefined) await this.ensureNameIsFree(workspaceId, input.name, merchantId);
    let archivedAt: Date | null | undefined;
    if (input.archived === true) archivedAt = current.archivedAt ?? new Date();
    if (input.archived === false) archivedAt = null;
    try {
      const merchant = await this.prisma.forWorkspace(workspaceId).merchant.update({
        where: { id: merchantId, workspaceId },
        data: { name: input.name, archivedAt },
        include: withUses,
      });
      return toResponse(merchant);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw merchantExists();
      if (isPrismaError(error, 'P2025')) throw new NotFoundException();
      throw error;
    }
  }

  /** One that is used can only be archived: the foreign keys refuse the delete. */
  async remove(workspaceId: string, merchantId: string): Promise<void> {
    await this.find(workspaceId, merchantId);
    try {
      const { count } = await this.prisma
        .forWorkspace(workspaceId)
        .merchant.deleteMany({ where: { id: merchantId, workspaceId } });
      if (count === 0) throw new NotFoundException();
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException({
          code: 'MERCHANT_IN_USE',
          message:
            'Este estabelecimento tem lançamentos, recorrências ou parcelamentos: ele não pode ser excluído, só arquivado.',
        });
      }
      throw error;
    }
  }

  /**
   * Another text the merchant appears as in a card statement (ADR 0055). Unique per workspace
   * after the cleaning that statement titles get (`normalizeStatementTitle`): the same alias
   * cannot point to two merchants. Answers the merchant with its aliases.
   */
  async addAlias(
    workspaceId: string,
    merchantId: string,
    input: CreateMerchantAliasInput,
  ): Promise<Merchant> {
    await this.find(workspaceId, merchantId);
    const normalized = normalizeStatementTitle(input.alias);
    if (!normalized) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'O apelido precisa ter mais que o número da parcela.',
      });
    }
    const db = this.prisma.forWorkspace(workspaceId);
    const taken = await db.merchantAlias.findFirst({
      where: { workspaceId, normalized },
      select: { merchant: { select: { name: true } } },
    });
    if (taken) throw aliasExists(taken.merchant.name);
    try {
      await db.merchantAlias.create({
        data: { workspaceId, merchantId, alias: input.alias, normalized },
      });
    } catch (error) {
      // Taken at the same time elsewhere.
      if (isPrismaError(error, 'P2002')) throw aliasExists(null);
      throw error;
    }
    const merchant = await db.merchant.findFirstOrThrow({
      where: { id: merchantId, workspaceId },
      include: withUses,
    });
    return toResponse(merchant);
  }

  async removeAlias(workspaceId: string, merchantId: string, aliasId: string): Promise<void> {
    await this.find(workspaceId, merchantId);
    if (!z.uuid().safeParse(aliasId).success) throw new NotFoundException();
    const { count } = await this.prisma
      .forWorkspace(workspaceId)
      .merchantAlias.deleteMany({ where: { id: aliasId, merchantId, workspaceId } });
    if (count === 0) throw new NotFoundException();
  }

  /** An id that is not a uuid, or that belongs to another workspace, is simply not found. */
  private async find(workspaceId: string, merchantId: string): Promise<MerchantRow> {
    if (!z.uuid().safeParse(merchantId).success) throw new NotFoundException();
    const merchant = await this.prisma
      .forWorkspace(workspaceId)
      .merchant.findFirst({ where: { id: merchantId, workspaceId } });
    if (!merchant) throw new NotFoundException();
    return merchant;
  }

  /** Names are unique per workspace, ignoring case and accents ("Acougue" = "Açougue"). */
  private async ensureNameIsFree(workspaceId: string, name: string, exceptId?: string) {
    const others = await this.prisma.forWorkspace(workspaceId).merchant.findMany({
      where: { workspaceId, ...(exceptId && { id: { not: exceptId } }) },
      select: { name: true },
    });
    const wanted = normalizeName(name);
    if (others.some((other) => normalizeName(other.name) === wanted)) throw merchantExists();
  }
}
