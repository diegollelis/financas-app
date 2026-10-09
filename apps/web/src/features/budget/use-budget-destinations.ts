import {
  budgetDestinationListResponseSchema,
  budgetDestinationSchema,
  type CreateBudgetDestinationInput,
  type UpdateBudgetDestinationInput,
} from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

const destinationsKey = (workspaceId: string) =>
  [...workspacesQueryKey, workspaceId, 'budget-destinations'] as const;

/** The workspace's budget destinations, archived too, in order (ADR 0047). */
export function useBudgetDestinations(workspaceId: string) {
  return useQuery({
    queryKey: destinationsKey(workspaceId),
    queryFn: () =>
      apiGet(
        `/api/workspaces/${workspaceId}/budget-destinations`,
        budgetDestinationListResponseSchema,
      ),
  });
}

/**
 * A destination changes its category, every budget that lists it and the dashboards with them:
 * everything of the workspace is fetched again.
 */
function useInvalidateWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [...workspacesQueryKey, workspaceId] });
}

export function useCreateBudgetDestination(workspaceId: string) {
  const onSuccess = useInvalidateWorkspace(workspaceId);
  return useMutation({
    mutationFn: (input: CreateBudgetDestinationInput) =>
      apiPost(`/api/workspaces/${workspaceId}/budget-destinations`, input, budgetDestinationSchema),
    onSuccess,
  });
}

export function useUpdateBudgetDestination(workspaceId: string) {
  const onSuccess = useInvalidateWorkspace(workspaceId);
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateBudgetDestinationInput & { id: string }) =>
      apiPatch(
        `/api/workspaces/${workspaceId}/budget-destinations/${id}`,
        input,
        budgetDestinationSchema,
      ),
    onSuccess,
  });
}

export function useDeleteBudgetDestination(workspaceId: string) {
  const onSuccess = useInvalidateWorkspace(workspaceId);
  return useMutation({
    mutationFn: (destinationId: string) =>
      apiDelete(`/api/workspaces/${workspaceId}/budget-destinations/${destinationId}`),
    onSuccess,
  });
}
