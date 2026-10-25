import {
  importCandidatesResponseSchema,
  importListResponseSchema,
  importSchema,
  type CreateImportInput,
  type ImportCandidatesInput,
} from '@financas/shared';
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

/**
 * What an account statement may already be in the app (ADR 0061): read once per file, fresh each
 * time a statement is opened (it also creates the recurrences' months of its range).
 */
export function useImportCandidates(workspaceId: string, input: ImportCandidatesInput | null) {
  return useQuery({
    queryKey: [...importsKey(workspaceId), 'candidates', input],
    queryFn: () =>
      apiPost(
        `/api/workspaces/${workspaceId}/imports/candidates`,
        input,
        importCandidatesResponseSchema,
      ),
    enabled: input !== null,
    gcTime: 0,
    staleTime: Infinity,
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

/**
 * Removes it from the history (ADR 0060 note): its transactions and plans stay, as if launched by
 * hand; it can no longer be undone at once.
 */
export function useForgetImport(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (importId: string) =>
      apiDelete(`/api/workspaces/${workspaceId}/imports/${importId}?keepTransactions=true`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importsKey(workspaceId) }),
  });
}
