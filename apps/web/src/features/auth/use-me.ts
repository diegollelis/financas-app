import { meResponseSchema, type MeResponse } from '@financas/shared';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router';
import { ApiError, apiGet } from '@/lib/api';

export const meQueryKey = ['me'] as const;

/** The signed-in user, or `null` without a session (401 is an answer here, not an error). */
async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await apiGet('/me', meResponseSchema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/**
 * The session state of the whole app: route guards and pages read it from here. Sign-in,
 * sign-up and sign-out update it directly, so it does not need to be refetched often.
 */
export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: fetchMe, staleTime: 5 * 60 * 1000 });
}

/**
 * The signed-in user on pages behind `RequireAuth`. It comes from the guard (Outlet context), so
 * a page never sees a null user, not even in the render right after sign-out.
 */
export function useCurrentUser(): MeResponse {
  return useOutletContext<MeResponse>();
}
