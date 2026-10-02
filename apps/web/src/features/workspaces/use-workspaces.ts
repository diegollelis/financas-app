import { workspaceListResponseSchema } from '@financas/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export const workspacesQueryKey = ['workspaces'] as const;

/** The signed-in user's workspaces, the personal one first (ADR 0024). */
export function useWorkspaces() {
  return useQuery({
    queryKey: workspacesQueryKey,
    queryFn: () => apiGet('/workspaces', workspaceListResponseSchema),
  });
}
