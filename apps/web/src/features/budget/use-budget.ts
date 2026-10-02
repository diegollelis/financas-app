import { budgetSchema, type BudgetInput } from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '@/lib/api';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

/** ['workspaces', id, 'budget', period]. */
const budgetKey = (workspaceId: string) => [...workspacesQueryKey, workspaceId, 'budget'] as const;

export function useBudget(workspaceId: string, period: string) {
  return useQuery({
    queryKey: [...budgetKey(workspaceId), period],
    queryFn: () => apiGet(`/workspaces/${workspaceId}/budget/${period}`, budgetSchema),
  });
}

export function useSaveBudget(workspaceId: string, period: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetInput) =>
      apiPut(`/workspaces/${workspaceId}/budget/${period}`, input, budgetSchema),
    // Every competência, not only this one: the later ones that were never saved inherit
    // from it (ADR 0030), so what was loaded for them is now stale too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetKey(workspaceId) }),
  });
}
