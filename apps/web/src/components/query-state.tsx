import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspaceGone } from '@/features/workspaces/workspace-gone';
import { ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/error-message';
import { ServerWait } from '@/components/server-wait';
import { useServerWaitMessage } from '@/lib/use-server-wait';

export { SLOW_LOADING_MS } from '@/lib/use-server-wait';

/** The part of a TanStack query this component reads. */
type QueryLike = {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

/**
 * A skeleton shaped like the content and, when it takes a while, the CL symbol with its rings
 * and the wait's words in steps above it: on Render's free plan the API sleeps when idle and
 * takes up to a minute to answer (ADR 0033, ADR 0036 note).
 */
export function LoadingState({ children }: { children: ReactNode }) {
  const message = useServerWaitMessage();
  return (
    <div aria-busy="true" className="grid gap-4">
      <div aria-live="polite">
        <span className="sr-only">Carregando…</span>
        {message && <ServerWait message={message} layout="inline" />}
      </div>
      <div aria-hidden className="grid gap-4">
        {children}
      </div>
    </div>
  );
}

/** Placeholder rows for a list or a form while it loads. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-6 w-32" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  // Same answer for "does not exist" and "not yours" (ADR 0025): explain and take them home.
  if (error instanceof ApiError && error.status === 404) return <WorkspaceGone />;
  return (
    <div role="alert" className="grid justify-items-start gap-3">
      <p className="text-destructive">{apiErrorMessage(error)}</p>
      <Button variant="outline" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Tentando…' : 'Tentar de novo'}
      </Button>
    </div>
  );
}

/**
 * What to show while the queries of a view are not all loaded: the skeleton, or the first error
 * with a way out. Renders nothing once every query succeeded; the page renders its content then.
 */
export function QueryState({
  queries,
  skeleton = <ListSkeleton />,
}: {
  queries: QueryLike[];
  skeleton?: ReactNode;
}) {
  const failed = queries.filter((query) => query.isError);
  if (failed.length > 0) {
    return (
      <ErrorState
        error={failed[0]?.error}
        retrying={failed.some((query) => query.isFetching)}
        onRetry={() => failed.forEach((query) => void query.refetch())}
      />
    );
  }
  if (queries.some((query) => query.isPending)) return <LoadingState>{skeleton}</LoadingState>;
  return null;
}
