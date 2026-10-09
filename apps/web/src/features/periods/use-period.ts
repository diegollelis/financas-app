import { currentPeriod, periodSchema } from '@financas/shared';
import { useSearchParams } from 'react-router';

/** The competência comes from `?competencia=YYYY-MM`; without it (or invalid), this month. */
export function usePeriod() {
  const [searchParams] = useSearchParams();
  const requested = periodSchema.safeParse(searchParams.get('competencia'));
  return requested.success ? requested.data : currentPeriod();
}

/**
 * The link to another competência of the same page: only `?competencia=` changes, and what else
 * the address holds (the transactions' `?situacao=`) stays.
 */
export function usePeriodLink() {
  const [searchParams] = useSearchParams();
  return (target: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('competencia', target);
    return { search: `?${params.toString()}` };
  };
}
