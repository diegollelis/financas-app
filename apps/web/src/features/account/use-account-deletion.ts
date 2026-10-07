import { accountDeletionSchema } from '@financas/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGet, apiPost } from '@/lib/api';
import { meQueryKey } from '@/features/auth/use-me';

// Account deletion (ADR 0041): Better Auth's /delete-user, with our checks before it.

const deleteUserResponseSchema = z.object({ success: z.boolean() });

/** What would block deleting the account: owned workspaces shared with someone. */
export function useDeletionCheck() {
  return useQuery({
    queryKey: [...meQueryKey, 'deletion'],
    queryFn: () => apiGet('/api/me/deletion', accountDeletionSchema),
  });
}

/** E-mails the confirmation link; nothing is deleted yet. */
export function useRequestDeletion() {
  return useMutation({
    mutationFn: () => apiPost('/api/auth/delete-user', {}, deleteUserResponseSchema),
  });
}

/**
 * Deletes the account with the token from the e-mailed link. The API ends the session too; the
 * caller then loads another page from scratch (navigateAway), so nothing of the account stays
 * in memory. Clearing the cache here instead would flash the sign-in page first.
 */
export function useConfirmDeletion(token: string) {
  return useMutation({
    mutationFn: () => apiPost('/api/auth/delete-user', { token }, deleteUserResponseSchema),
  });
}
