import {
  accountSecuritySchema,
  statusResponseSchema,
  type ChangePasswordInput,
  type UpdateNameInput,
} from '@financas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { meQueryKey } from '@/features/auth/use-me';
import { apiGet, apiPost } from '@/lib/api';

const securityKey = [...meQueryKey, 'security'] as const;

/** Whether the account has a password, and the devices signed in (ADR 0049). */
export function useAccountSecurity() {
  return useQuery({
    queryKey: securityKey,
    queryFn: () => apiGet('/api/me/security', accountSecuritySchema),
  });
}

/** The name, through Better Auth; the session query is fetched again with it. */
export function useUpdateName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateNameInput) =>
      apiPost('/api/auth/update-user', input, statusResponseSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meQueryKey }),
  });
}

/**
 * The password. The API always signs the other devices out (ADR 0049); this one keeps going
 * with a new session, and the list of devices is fetched again.
 */
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      // The answer carries the new session, which the cookie already holds: nothing to read.
      apiPost('/api/auth/change-password', input, z.object({}).loose()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: securityKey }),
  });
}

/** "Sair dos outros aparelhos": every session but this one ends. */
export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost('/api/auth/revoke-other-sessions', {}, statusResponseSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: securityKey }),
  });
}
