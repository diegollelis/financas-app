import { summarySchema } from '@financas/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

/**
 * ['workspaces', id, 'summary', period]. The summary is derived from the transactions and the
 * budget (ADR 0031), so the mutations of both invalidate it.
 */
export const summaryKey = (workspaceId: string) =>
  [...workspacesQueryKey, workspaceId, 'summary'] as const;

export function useSummary(workspaceId: string, period: string) {
  return useQuery({
    queryKey: [...summaryKey(workspaceId), period],
    queryFn: () => apiGet(`/api/workspaces/${workspaceId}/summary/${period}`, summarySchema),
  });
}
