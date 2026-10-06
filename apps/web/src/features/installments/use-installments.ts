import {
  installmentPlanListResponseSchema,
  installmentPlanSchema,
  type CreateInstallmentPlanInput,
} from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { useInvalidateTransactions } from '@/features/transactions/use-transactions';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

/** ['workspaces', id, 'installments'] (ADR 0038). */
const installmentsKey = (workspaceId: string) =>
  [...workspacesQueryKey, workspaceId, 'installments'] as const;

export function useInstallmentPlans(workspaceId: string) {
  return useQuery({
    queryKey: installmentsKey(workspaceId),
    queryFn: () =>
      apiGet(`/api/workspaces/${workspaceId}/installments`, installmentPlanListResponseSchema),
  });
}

/** A plan and the installments it created or removed: the list, the months, dashboard, analysis. */
function useInvalidateInstallments(workspaceId: string) {
  const queryClient = useQueryClient();
  const invalidateTransactions = useInvalidateTransactions(workspaceId);
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: installmentsKey(workspaceId) }),
      invalidateTransactions(),
    ]);
}

/** Creates the plan and all its installments, one per month from the competência on screen. */
export function useCreateInstallmentPlan(workspaceId: string) {
  const onSuccess = useInvalidateInstallments(workspaceId);
  return useMutation({
    mutationFn: (input: CreateInstallmentPlanInput) =>
      apiPost(`/api/workspaces/${workspaceId}/installments`, input, installmentPlanSchema),
    onSuccess,
  });
}

/** Ends it: its pending installments from this month on are removed. */
export function useEndInstallmentPlan(workspaceId: string) {
  const onSuccess = useInvalidateInstallments(workspaceId);
  return useMutation({
    mutationFn: (planId: string) =>
      apiDelete(`/api/workspaces/${workspaceId}/installments/${planId}`),
    onSuccess,
  });
}
