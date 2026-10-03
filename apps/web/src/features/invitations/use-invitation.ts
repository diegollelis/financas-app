import { invitationPreviewSchema, workspaceSchema } from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiGet, apiPost } from '@/lib/api';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

/** What the invitation link shows; `null` when it is unknown, used, cancelled or expired. */
export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: ['invitations', token],
    queryFn: async () => {
      try {
        return await apiGet(
          `/api/invitations/${encodeURIComponent(token)}`,
          invitationPreviewSchema,
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}

export function useAcceptInvitation(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost(`/api/invitations/${encodeURIComponent(token)}/accept`, {}, workspaceSchema),
    // The new workspace appears in the list; the e-mail is now verified too.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: workspacesQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['me'] }),
      ]),
  });
}
