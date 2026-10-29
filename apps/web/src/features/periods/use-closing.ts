import {
  periodClosingStateSchema,
  type PeriodClosingState,
  type ReopenPeriodInput,
} from '@financas/shared';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { budgetKey } from '@/features/budget/use-budget';
import { summaryKey } from '@/features/summary/use-summary';
import { workspacesQueryKey } from '@/features/workspaces/use-workspaces';

/**
 * ['workspaces', id, 'closing', period] (ADR 0063): whether the month is closed, its history and,
 * while open, what keeps it from closing. Transaction mutations invalidate it, since what is
 * pending changes with them.
 */
export const closingKey = (workspaceId: string) =>
  [...workspacesQueryKey, workspaceId, 'closing'] as const;

const closingPath = (workspaceId: string, period: string) =>
  `/api/workspaces/${workspaceId}/periods/${period}`;

export function useClosing(workspaceId: string, period: string) {
  return useQuery({
    queryKey: [...closingKey(workspaceId), period],
    queryFn: () => apiGet(`${closingPath(workspaceId, period)}/closing`, periodClosingStateSchema),
  });
}

/** Which of these months are closed, as each one's state loads (an import's review). */
export function useClosedPeriods(workspaceId: string, periods: string[]): ReadonlySet<string> {
  const states = useQueries({
    queries: periods.map((period) => ({
      queryKey: [...closingKey(workspaceId), period],
      queryFn: () =>
        apiGet(`${closingPath(workspaceId, period)}/closing`, periodClosingStateSchema),
    })),
  });
  return new Set(states.flatMap((state) => (state.data?.closing ? [state.data.period] : [])));
}

/** Whether the month is closed; false while that is not known yet, as the API still checks. */
export function useIsClosed(workspaceId: string, period: string) {
  return Boolean(useClosing(workspaceId, period).data?.closing);
}

function useOnClosingChange(workspaceId: string, period: string) {
  const queryClient = useQueryClient();
  // The answer is the month's new state; no other month's changes.
  return (state: PeriodClosingState) => {
    queryClient.setQueryData([...closingKey(workspaceId), period], state);
    return Promise.all([
      // Closing saves an inherited budget as the month's own (ADR 0063).
      queryClient.invalidateQueries({ queryKey: budgetKey(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: summaryKey(workspaceId) }),
    ]);
  };
}

export function useClosePeriod(workspaceId: string, period: string) {
  const onSuccess = useOnClosingChange(workspaceId, period);
  return useMutation({
    mutationFn: () =>
      apiPost(`${closingPath(workspaceId, period)}/close`, {}, periodClosingStateSchema),
    onSuccess,
  });
}

export function useReopenPeriod(workspaceId: string, period: string) {
  const onSuccess = useOnClosingChange(workspaceId, period);
  return useMutation({
    mutationFn: (input: ReopenPeriodInput) =>
      apiPost(`${closingPath(workspaceId, period)}/reopen`, input, periodClosingStateSchema),
    onSuccess,
  });
}
