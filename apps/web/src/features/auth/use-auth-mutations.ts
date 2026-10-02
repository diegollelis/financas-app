import {
  authResponseSchema,
  statusResponseSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
} from '@financas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiPost } from '@/lib/api';
import { meQueryKey } from './use-me';

// Better Auth routes (ADR 0020). On success the session cookie is set by the API; here we only
// update the cached user, and the route guards redirect on their own.

export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SignUpInput) =>
      apiPost('/api/auth/sign-up/email', input, authResponseSchema),
    onSuccess: ({ user }) => queryClient.setQueryData(meQueryKey, user),
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SignInInput) =>
      apiPost('/api/auth/sign-in/email', input, authResponseSchema),
    onSuccess: ({ user }) => queryClient.setQueryData(meQueryKey, user),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost('/api/auth/sign-out', {}, z.object({ success: z.boolean() })),
    onSuccess: () => {
      queryClient.setQueryData(meQueryKey, null);
      // Drops everything else cached: the next person on this browser must not see it.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meQueryKey[0] });
    },
  });
}

/** Always "succeeds" for any e-mail: the API does not reveal which e-mails have an account. */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) =>
      apiPost('/api/auth/request-password-reset', input, statusResponseSchema),
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      apiPost('/api/auth/reset-password', input, statusResponseSchema),
    // The API signs out every session of the user, this browser included.
    onSuccess: () => queryClient.setQueryData(meQueryKey, null),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) =>
      apiPost('/api/auth/send-verification-email', { email }, statusResponseSchema),
  });
}
