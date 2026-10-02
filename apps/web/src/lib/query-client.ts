import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The API sleeps when idle on the free plan (ADR 0009): the first call can fail.
        retry: 2,
      },
    },
  });
}
