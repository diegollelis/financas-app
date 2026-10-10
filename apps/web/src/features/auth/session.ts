import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { meQueryKey } from './use-me';

/**
 * A 401 from our own routes: the session is gone (signed out on another device, expired, password
 * changed). Better Auth's routes answer 401 for other reasons (a wrong password at sign-in), and
 * `GET /api/me` turns its 401 into "no user" by itself.
 */
export function isSessionLost(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 && !error.path.startsWith('/api/auth/');
}

/**
 * Forgets the signed-in user and everything cached for them: the next person on this browser must
 * not see it. `RequireAuth` then sends to the sign-in page.
 */
export function clearSession(queryClient: QueryClient) {
  queryClient.setQueryData(meQueryKey, null);
  queryClient.removeQueries({
    predicate: ({ queryKey }) => !(queryKey.length === 1 && queryKey[0] === meQueryKey[0]),
  });
}
