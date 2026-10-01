import { healthResponseSchema } from '@financas/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet('/health', healthResponseSchema),
    // The API sleeps when idle on the free plan (ADR 0009): the first call can take a while.
    retry: 2,
  });
}
