import {
  installmentPlanListResponseSchema,
  installmentPlanSchema,
  type CreateInstallmentPlanInput,
  type UpdateInstallmentPlanInput,
} from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
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

/**
 * Changes it (ADR 0038 note): what it is reaches the pending installments; the amounts remake
 * every installment, only while none is settled and it is not split.
 */
export function useUpdateInstallmentPlan(workspaceId: string) {
  const onSuccess = useInvalidateInstallments(workspaceId);
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateInstallmentPlanInput & { id: string }) =>
      apiPatch(`/api/workspaces/${workspaceId}/installments/${id}`, input, installmentPlanSchema),
    onSuccess,
  });
}

/**
 * Ends it: its pending installments from this month on are removed. With none settled, it is
 * deleted with every installment instead (ADR 0038 note).
 */
export function useEndInstallmentPlan(workspaceId: string) {
  const onSuccess = useInvalidateInstallments(workspaceId);
  return useMutation({
    mutationFn: (planId: string) =>
      apiDelete(`/api/workspaces/${workspaceId}/installments/${planId}`),
    onSuccess,
  });
}
