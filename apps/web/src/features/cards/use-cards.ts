import {
  cardBillListResponseSchema,
  cardListResponseSchema,
  cardSchema,
  linkCardResponseSchema,
  payCardBillResponseSchema,
  unlinkedCardTransactionsSchema,
  type CreateCardInput,
  type LinkCardInput,
  type PaymentMethod,
  type PayCardBillInput,
  type UndoCardBillInput,
  type UpdateCardInput,
} from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';
import { paymentMethodText } from './card-label';

/** ['workspaces', id, 'cards'] (ADR 0062): `inUse` changes with the transactions. */
export const cardsKey = (workspaceId: string) =>
  [...workspacesQueryKey, workspaceId, 'cards'] as const;

export function useCards(workspaceId: string) {
  return useQuery({
    queryKey: cardsKey(workspaceId),
    queryFn: () => apiGet(`/api/workspaces/${workspaceId}/cards`, cardListResponseSchema),
  });
}

export function useCreateCard(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCardInput) =>
      apiPost(`/api/workspaces/${workspaceId}/cards`, input, cardSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cardsKey(workspaceId) }),
  });
}

export function useUpdateCard(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCardInput & { id: string }) =>
      apiPatch(`/api/workspaces/${workspaceId}/cards/${id}`, input, cardSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cardsKey(workspaceId) }),
  });
}

export function useDeleteCard(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) => apiDelete(`/api/workspaces/${workspaceId}/cards/${cardId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cardsKey(workspaceId) }),
  });
}

/**
 * "Crédito no Cartão Exemplo" for a row of the current workspace (ADR 0062); null without a
 * method. The cards come from the cache shared by the page.
 */
export function usePaymentMethodText() {
  const { id: workspaceId } = useCurrentWorkspace();
  const cards = useCards(workspaceId).data ?? [];
  return (paymentMethod: PaymentMethod | null, cardId: string | null) =>
    paymentMethod ? paymentMethodText(paymentMethod, cardId, cards) : null;
}

/** ['workspaces', id, 'cards', 'bills']: under the cards, so a change of them reloads it. */
export const cardBillsKey = (workspaceId: string) => [...cardsKey(workspaceId), 'bills'] as const;

/** Every bill still to pay (ADR 0062): what "Pagar fatura" offers. */
export function useCardBills(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: cardBillsKey(workspaceId),
    queryFn: () => apiGet(`/api/workspaces/${workspaceId}/cards/bills`, cardBillListResponseSchema),
    enabled,
  });
}

/**
 * "Pagar fatura" and its "Desfazer": transactions of any month change, and with them the
 * dashboard, the analysis and the people, so every list of the workspace is fetched again.
 */
export function usePayBill(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, ...input }: PayCardBillInput & { cardId: string }) =>
      apiPost(
        `/api/workspaces/${workspaceId}/cards/${cardId}/bills/pay`,
        input,
        payCardBillResponseSchema,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...workspacesQueryKey, workspaceId] }),
  });
}

export function useUndoBill(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, ...input }: UndoCardBillInput & { cardId: string }) =>
      apiPost(`/api/workspaces/${workspaceId}/cards/${cardId}/bills/undo`, input, z.undefined()),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...workspacesQueryKey, workspaceId] }),
  });
}

/** The transactions with no card the first card offers to take (ADR 0062 note). */
export function fetchUnlinked(workspaceId: string) {
  return apiGet(`/api/workspaces/${workspaceId}/cards/unlinked`, unlinkedCardTransactionsSchema);
}

/**
 * Gives the card to those transactions, and to the running recurrences and plans: every list of
 * the workspace may change (transactions of any month, recurrences, the cards' `inUse`).
 */
export function useLinkCard(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, ...input }: LinkCardInput & { cardId: string }) =>
      apiPost(`/api/workspaces/${workspaceId}/cards/${cardId}/link`, input, linkCardResponseSchema),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...workspacesQueryKey, workspaceId] }),
  });
}
