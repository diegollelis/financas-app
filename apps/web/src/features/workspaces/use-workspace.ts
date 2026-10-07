import {
  createInvitationInputSchema,
  invitationListResponseSchema,
  invitationSchema,
  memberListResponseSchema,
  workspaceSchema,
  type CreateWorkspaceInput,
} from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { workspacesQueryKey } from './use-workspaces';

// Everything about one workspace lives under ['workspaces', id, ...], so a single invalidation
// of ['workspaces'] refreshes the list and the open workspace.
const keys = {
  workspace: (id: string) => [...workspacesQueryKey, id] as const,
  members: (id: string) => [...workspacesQueryKey, id, 'members'] as const,
  invitations: (id: string) => [...workspacesQueryKey, id, 'invitations'] as const,
};

export function useWorkspace(workspaceId: string) {
  return useQuery({
    queryKey: keys.workspace(workspaceId),
    queryFn: () => apiGet(`/api/workspaces/${workspaceId}`, workspaceSchema),
  });
}

export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: keys.members(workspaceId),
    queryFn: () => apiGet(`/api/workspaces/${workspaceId}/members`, memberListResponseSchema),
  });
}

/** Pending invitations. Only the OWNER may list them: pass `enabled` accordingly. */
export function useInvitations(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.invitations(workspaceId),
    queryFn: () =>
      apiGet(`/api/workspaces/${workspaceId}/invitations`, invitationListResponseSchema),
    enabled,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => apiPost('/api/workspaces', input, workspaceSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspacesQueryKey }),
  });
}

export function useCreateInvitation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: z.input<typeof createInvitationInputSchema>) =>
      apiPost(`/api/workspaces/${workspaceId}/invitations`, input, invitationSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invitations(workspaceId) }),
  });
}

export function useRevokeInvitation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiDelete(`/api/workspaces/${workspaceId}/invitations/${invitationId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invitations(workspaceId) }),
  });
}

/** The OWNER removes someone, or a member removes themselves (leaves). */
export function useRemoveMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiDelete(`/api/workspaces/${workspaceId}/members/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.members(workspaceId) }),
  });
}

/**
 * Leaving or deleting a workspace: the caller first goes elsewhere (its pages would refetch and
 * find nothing), then this drops what was cached of it and refreshes the list of workspaces.
 */
export function useForgetWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.removeQueries({ queryKey: keys.workspace(workspaceId) });
    return queryClient.invalidateQueries({ queryKey: workspacesQueryKey, exact: true });
  };
}

/** A shared workspace and everything in it (OWNER only; never the personal one). */
export function useDeleteWorkspace(workspaceId: string) {
  return useMutation({ mutationFn: () => apiDelete(`/api/workspaces/${workspaceId}`) });
}
