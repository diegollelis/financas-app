import {
  transactionListResponseSchema,
  transactionSchema,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from '@financas/shared';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { analysisKey } from '@/features/analysis/use-analysis';
import { peopleKey } from '@/features/people/use-people';
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

/**
 * The transactions of several competências at once (a card statement spans months, ADR 0055
 * note): one query per month, the same as the list's, and all of them once every one is loaded.
 */
export function useTransactionsOf(workspaceId: string, periods: string[]) {
  return useQueries({
    queries: periods.map((period) => ({
      queryKey: [...transactionsKey(workspaceId), period],
      queryFn: () =>
        apiGet(
          `/api/workspaces/${workspaceId}/transactions?period=${period}`,
          transactionListResponseSchema,
        ),
    })),
    combine: (results) => ({
      data: results.every((result) => result.isSuccess)
        ? results.flatMap((result) => result.data ?? [])
        : undefined,
      isPending: results.some((result) => result.isPending),
      isFetching: results.some((result) => result.isFetching),
      isError: results.some((result) => result.isError),
      error: results.find((result) => result.isError)?.error ?? null,
      refetch: () => Promise.all(results.map((result) => result.refetch())),
    }),
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
      // What each person owes, or is owed, comes from the pending transactions (ADR 0042).
      queryClient.invalidateQueries({ queryKey: peopleKey(workspaceId) }),
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

/** `withShares`: also the shares split from this debit (ADR 0042). */
export function useDeleteTransaction(workspaceId: string) {
  const onSuccess = useInvalidateTransactions(workspaceId);
  return useMutation({
    mutationFn: ({ id, withShares = false }: { id: string; withShares?: boolean }) =>
      apiDelete(
        `/api/workspaces/${workspaceId}/transactions/${id}${withShares ? '?withShares=true' : ''}`,
      ),
    onSuccess,
  });
}
