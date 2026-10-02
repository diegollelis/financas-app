import {
  transactionListResponseSchema,
  transactionSchema,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { summaryKey } from '@/features/summary/use-summary';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

/** ['workspaces', id, 'transactions', period]: a change refreshes every loaded competência. */
const transactionsKey = (workspaceId: string) =>
  [...workspacesQueryKey, workspaceId, 'transactions'] as const;

export function useTransactions(workspaceId: string, period: string) {
  return useQuery({
    queryKey: [...transactionsKey(workspaceId), period],
    queryFn: () =>
      apiGet(
        `/workspaces/${workspaceId}/transactions?period=${period}`,
        transactionListResponseSchema,
      ),
  });
}

function useInvalidateTransactions(workspaceId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: transactionsKey(workspaceId) }),
      // The month's dashboard is computed from the transactions.
      queryClient.invalidateQueries({ queryKey: summaryKey(workspaceId) }),
    ]);
}

export function useCreateTransaction(workspaceId: string) {
  const onSuccess = useInvalidateTransactions(workspaceId);
  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      apiPost(`/workspaces/${workspaceId}/transactions`, input, transactionSchema),
    onSuccess,
  });
}

export function useUpdateTransaction(workspaceId: string) {
  const onSuccess = useInvalidateTransactions(workspaceId);
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateTransactionInput & { id: string }) =>
      apiPatch(`/workspaces/${workspaceId}/transactions/${id}`, input, transactionSchema),
    onSuccess,
  });
}

export function useDeleteTransaction(workspaceId: string) {
  const onSuccess = useInvalidateTransactions(workspaceId);
  return useMutation({
    mutationFn: (transactionId: string) =>
      apiDelete(`/workspaces/${workspaceId}/transactions/${transactionId}`),
    onSuccess,
  });
}
