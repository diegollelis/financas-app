import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { clearSession, isSessionLost } from '@/features/auth/session';

/**
 * `retry`: how many times a failed query tries again (tests pass 0). A lost session (401) is
 * never retried: any query or mutation that meets one signs the browser out, and the route guard
 * takes the person to the sign-in page.
 */
export function createQueryClient({ retry = 2 }: { retry?: number } = {}) {
  const onError = (error: unknown) => {
    if (isSessionLost(error)) clearSession(queryClient);
  };
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        // The API sleeps when idle on the free plan (ADR 0009): the first call can fail.
        retry: (failureCount, error) => !isSessionLost(error) && failureCount < retry,
      },
    },
  });
  return queryClient;
}
