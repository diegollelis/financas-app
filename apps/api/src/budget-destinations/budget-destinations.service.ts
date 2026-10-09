import type {
  BudgetDestination,
  CreateBudgetDestinationInput,
  UpdateBudgetDestinationInput,
} from '@financas/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type BudgetDestination as DestinationRow } from '../generated/prisma/client.js';
import { PrismaService, setWorkspaceContext } from '../prisma/prisma.service.js';

function toResponse(destination: DestinationRow): BudgetDestination {
  return {
    id: destination.id,
    name: destination.name,
    kind: destination.kind,
    categoryId: destination.categoryId,
    archived: destination.archivedAt !== null,
    position: destination.position,
  };
}

const destinationExists = () =>
  new ConflictException({
    code: 'DESTINATION_EXISTS',
    message: 'Já existe um destino com esse nome. Se ele estiver arquivado, reative-o.',
  });

const categoryTaken = () =>
  new ConflictException({
    code: 'CATEGORY_EXISTS',
    message:
      'Já existe uma categoria de débito com esse nome. O destino cria a sua própria: escolha outro nome.',
  });

const expensesFixed = () =>
  new ConflictException({
    code: 'DESTINATION_FIXED',
    message:
      'Despesas é o destino fixo do orçamento: ele não pode ser renomeado, arquivado nem excluído.',
  });

function isPrismaError(error: unknown, code: 'P2002' | 'P2003' | 'P2025') {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * Destinations of one workspace's budget (ADR 0047). Despesas is fixed; each saving destination
 * owns a debit category, and the two change together: created, renamed, archived and deleted
 * in one transaction. The workspaceId comes from WorkspaceMemberGuard; writes run in a
 * transaction with the RLS context set (setWorkspaceContext), reads through forWorkspace.
 */
@Injectable()
export class BudgetDestinationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** All of them, archived too, in the order they are shown. */
  async list(workspaceId: string): Promise<BudgetDestination[]> {
    const destinations = await this.prisma.forWorkspace(workspaceId).budgetDestination.findMany({
      where: { workspaceId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return destinations.map(toResponse);
  }

  /** A saving destination, last in the order, with its debit category of the same name. */
  async create(
    workspaceId: string,
    input: CreateBudgetDestinationInput,
  ): Promise<BudgetDestination> {
    try {
      const destination = await this.prisma.$transaction(async (tx) => {
        await setWorkspaceContext(tx, workspaceId);
        await this.ensureNamesAreFree(tx, workspaceId, input.name);
        const last = await tx.budgetDestination.aggregate({
          where: { workspaceId },
          _max: { position: true },
        });
        const category = await tx.category.create({
          data: { workspaceId, name: input.name, type: 'DEBIT' },
        });
        return tx.budgetDestination.create({
          data: {
            workspaceId,
            name: input.name,
            kind: 'SAVINGS',
            position: (last._max.position ?? -1) + 1,
            categoryId: category.id,
          },
        });
      });
      return toResponse(destination);
    } catch (error) {
      // Two simultaneous requests with the same name: the unique indexes decide.
      if (isPrismaError(error, 'P2002')) throw destinationExists();
      throw error;
    }
  }

  /** Renames and/or archives a saving destination, and its category along with it. */
  async update(
    workspaceId: string,
    destinationId: string,
    input: UpdateBudgetDestinationInput,
  ): Promise<BudgetDestination> {
    if (!z.uuid().safeParse(destinationId).success) throw new NotFoundException();
    try {
      const destination = await this.prisma.$transaction(async (tx) => {
        await setWorkspaceContext(tx, workspaceId);
        const current = await tx.budgetDestination.findFirst({
          where: { id: destinationId, workspaceId },
        });
        if (!current) throw new NotFoundException();
        if (current.kind === 'EXPENSES' || !current.categoryId) throw expensesFixed();
        if (input.name !== undefined) {
          await this.ensureNamesAreFree(tx, workspaceId, input.name, current);
        }
        let archivedAt: Date | null | undefined;
        if (input.archived === true) archivedAt = current.archivedAt ?? new Date();
        if (input.archived === false) archivedAt = null;
        await tx.category.update({
          where: { id: current.categoryId, workspaceId },
          data: { name: input.name, archivedAt },
        });
        return tx.budgetDestination.update({
          where: { id: destinationId, workspaceId },
          data: { name: input.name, archivedAt },
        });
      });
      return toResponse(destination);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw destinationExists();
      if (isPrismaError(error, 'P2025')) throw new NotFoundException();
      throw error;
    }
  }

  /**
   * Deletes a saving destination and its category. One whose category has transactions,
   * recurrences or installment plans can only be archived: their foreign keys refuse the
   * delete, which undoes the whole transaction and becomes a 409.
   */
  async remove(workspaceId: string, destinationId: string): Promise<void> {
    if (!z.uuid().safeParse(destinationId).success) throw new NotFoundException();
    try {
      await this.prisma.$transaction(async (tx) => {
        await setWorkspaceContext(tx, workspaceId);
        const current = await tx.budgetDestination.findFirst({
          where: { id: destinationId, workspaceId },
        });
        if (!current) throw new NotFoundException();
        if (current.kind === 'EXPENSES' || !current.categoryId) throw expensesFixed();
        await tx.budgetDestination.delete({ where: { id: destinationId } });
        await tx.category.delete({ where: { id: current.categoryId } });
      });
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException({
          code: 'DESTINATION_IN_USE',
          message:
            'Este destino tem lançamentos, recorrências ou parcelamentos: ele não pode ser excluído, só arquivado.',
        });
      }
      throw error;
    }
  }

  /**
   * Names are unique per workspace, ignoring case, among destinations and among debit
   * categories (the destination's category takes its name). Renaming keeps its own.
   */
  private async ensureNamesAreFree(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    name: string,
    current?: DestinationRow,
  ) {
    const sameName = { equals: name, mode: 'insensitive' as const };
    const destination = await tx.budgetDestination.findFirst({
      where: { workspaceId, name: sameName, ...(current && { id: { not: current.id } }) },
    });
    if (destination) throw destinationExists();
    const category = await tx.category.findFirst({
      where: {
        workspaceId,
        type: 'DEBIT',
        name: sameName,
        ...(current?.categoryId && { id: { not: current.categoryId } }),
      },
    });
    if (category) throw categoryTaken();
  }
}
