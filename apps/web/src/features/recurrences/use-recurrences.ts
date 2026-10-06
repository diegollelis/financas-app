import {
  recurrenceListResponseSchema,
  recurrenceSchema,
  type CreateRecurrenceInput,
  type UpdateRecurrenceInput,
} from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { useInvalidateTransactions } from '@/features/transactions/use-transactions';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

/** ['workspaces', id, 'recurrences'] (ADR 0038). */
const recurrencesKey = (workspaceId: string) =>
  [...workspacesQueryKey, workspaceId, 'recurrences'] as const;

export function useRecurrences(workspaceId: string) {
  return useQuery({
    queryKey: recurrencesKey(workspaceId),
    queryFn: () =>
      apiGet(`/api/workspaces/${workspaceId}/recurrences`, recurrenceListResponseSchema),
  });
}

/** A recurrence and the transactions it touched: the list, the months, dashboard, analysis. */
function useInvalidateRecurrences(workspaceId: string) {
  const queryClient = useQueryClient();
  const invalidateTransactions = useInvalidateTransactions(workspaceId);
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: recurrencesKey(workspaceId) }),
      invalidateTransactions(),
    ]);
}

/** Creates it, and its transaction in the first competência (the one on screen). */
export function useCreateRecurrence(workspaceId: string) {
  const onSuccess = useInvalidateRecurrences(workspaceId);
  return useMutation({
    mutationFn: (input: CreateRecurrenceInput) =>
      apiPost(`/api/workspaces/${workspaceId}/recurrences`, input, recurrenceSchema),
    onSuccess,
  });
}

/** Ends it: no new months, pending transactions from this month on removed. */
export function useEndRecurrence(workspaceId: string) {
  const onSuccess = useInvalidateRecurrences(workspaceId);
  return useMutation({
    mutationFn: (recurrenceId: string) =>
      apiDelete(`/api/workspaces/${workspaceId}/recurrences/${recurrenceId}`),
    onSuccess,
  });
}

/**
 * Changes it, and its pending transactions from this month on (ADR 0038). Send only what
 * changed: every field sent is copied to those transactions, undoing a month adjusted by hand.
 */
export function useUpdateRecurrence(workspaceId: string) {
  const onSuccess = useInvalidateRecurrences(workspaceId);
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateRecurrenceInput & { id: string }) =>
      apiPatch(`/api/workspaces/${workspaceId}/recurrences/${id}`, input, recurrenceSchema),
    onSuccess,
  });
}
