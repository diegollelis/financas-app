import { importListResponseSchema, importSchema, type CreateImportInput } from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { useInvalidateTransactions } from '@/features/transactions/use-transactions';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

/** ['workspaces', id, 'imports'] (ADR 0040). */
const importsKey = (workspaceId: string) =>
  [...workspacesQueryKey, workspaceId, 'imports'] as const;

export function useImports(workspaceId: string) {
  return useQuery({
    queryKey: importsKey(workspaceId),
    queryFn: () => apiGet(`/api/workspaces/${workspaceId}/imports`, importListResponseSchema),
  });
}

/** An import and the transactions it brought or took: the list, the months, dashboard, analysis. */
function useInvalidateImports(workspaceId: string) {
  const queryClient = useQueryClient();
  const invalidateTransactions = useInvalidateTransactions(workspaceId);
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: importsKey(workspaceId) }),
      invalidateTransactions(),
    ]);
}

/** Every confirmed transaction in one request: all are created, or none. */
export function useCreateImport(workspaceId: string) {
  const onSuccess = useInvalidateImports(workspaceId);
  return useMutation({
    mutationFn: (input: CreateImportInput) =>
      apiPost(`/api/workspaces/${workspaceId}/imports`, input, importSchema),
    onSuccess,
  });
}

/** Undoes it: every transaction it brought goes, also those changed since. */
export function useUndoImport(workspaceId: string) {
  const onSuccess = useInvalidateImports(workspaceId);
  return useMutation({
    mutationFn: (importId: string) =>
      apiDelete(`/api/workspaces/${workspaceId}/imports/${importId}`),
    onSuccess,
  });
}
