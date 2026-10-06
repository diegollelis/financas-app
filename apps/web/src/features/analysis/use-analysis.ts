import { analysisSchema } from '@financas/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

/**
 * ['workspaces', id, 'analysis', from, to]. Sums of the transactions (ADR 0037): transaction
 * mutations invalidate it. Only the range goes to the API; the other filters work on the result.
 */
export const analysisKey = (workspaceId: string) =>
  [...workspacesQueryKey, workspaceId, 'analysis'] as const;

export function useAnalysis(workspaceId: string, from: string, to: string) {
  return useQuery({
    queryKey: [...analysisKey(workspaceId), from, to],
    queryFn: () =>
      apiGet(`/api/workspaces/${workspaceId}/analysis?from=${from}&to=${to}`, analysisSchema),
  });
}
