import { currentPeriod, periodSchema } from '@financas/shared';
import { useSearchParams } from 'react-router';

/** The competência comes from `?competencia=YYYY-MM`; without it (or invalid), this month. */
export function usePeriod() {
  const [searchParams] = useSearchParams();
  const requested = periodSchema.safeParse(searchParams.get('competencia'));
  return requested.success ? requested.data : currentPeriod();
}
