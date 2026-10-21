import { useElapsed } from '@/lib/use-elapsed';

/** After this long, a pending request is most likely the API waking up (ADR 0033). */
export const SLOW_LOADING_MS = 3000;
/** Then the words move on: it is waking up, and later, it is taking longer than it should. */
export const WAKING_MS = 15_000;
export const LATE_MS = 45_000;

/**
 * What to say while the API wakes up on Render's free plan (ADR 0033), by how long it has been:
 * nothing in the first seconds, then three short steps (ADR 0036 note). The clock starts when
 * the component that calls it mounts.
 */
export function useServerWaitMessage() {
  const slow = useElapsed(SLOW_LOADING_MS);
  const waking = useElapsed(WAKING_MS);
  const late = useElapsed(LATE_MS);
  if (late) return 'Está demorando mais que o normal.';
  if (waking) return 'Acordando o servidor, só mais um pouco…';
  if (slow) return 'Aguardando o servidor…';
  return null;
}
