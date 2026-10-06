import {
  transactionListResponseSchema,
  transactionSchema,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { analysisKey } from '@/features/analysis/use-analysis';
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
        `/api/workspaces/${workspaceId}/transactions?period=${period}`,
        transactionListResponseSchema,
      ),
  });
}

/** Everything derived from the transactions: also used when recurrences create or remove them. */
export function useInvalidateTransactions(workspaceId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: transactionsKey(workspaceId) }),
      // The month's dashboard and the analysis are computed from the transactions.
      queryClient.invalidateQueries({ queryKey: summaryKey(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: analysisKey(workspaceId) }),
    ]);
}

export function useCreateTransaction(workspaceId: string) {
  const onSuccess = useInvalidateTransactions(workspaceId);
  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      apiPost(`/api/workspaces/${workspaceId}/transactions`, input, transactionSchema),
    onSuccess,
  });
}

export function useUpdateTransaction(workspaceId: string) {
  const onSuccess = useInvalidateTransactions(workspaceId);
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateTransactionInput & { id: string }) =>
      apiPatch(`/api/workspaces/${workspaceId}/transactions/${id}`, input, transactionSchema),
    onSuccess,
  });
}

export function useDeleteTransaction(workspaceId: string) {
  const onSuccess = useInvalidateTransactions(workspaceId);
  return useMutation({
    mutationFn: (transactionId: string) =>
      apiDelete(`/api/workspaces/${workspaceId}/transactions/${transactionId}`),
    onSuccess,
  });
}
