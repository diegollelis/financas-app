import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/error-message';

/** After this long, a pending request is most likely the API waking up (ADR 0033). */
export const SLOW_LOADING_MS = 3000;

/** The part of a TanStack query this component reads. */
type QueryLike = {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

function useElapsed(ms: number) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return elapsed;
}

/**
 * A skeleton shaped like the content, plus a word about the cold start when it takes a while: on
 * Render's free plan the API sleeps when idle and takes up to a minute to answer (ADR 0033).
 */
export function LoadingState({ children }: { children: ReactNode }) {
  const slow = useElapsed(SLOW_LOADING_MS);
  return (
    <div aria-busy="true" className="grid gap-4">
      <div aria-live="polite">
        <span className="sr-only">Carregando…</span>
        {slow && (
          <p className="text-muted-foreground">
            Acordando o servidor… isso pode levar até um minuto.
          </p>
        )}
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
  if (error instanceof ApiError && error.status === 404) {
    // Same answer for "does not exist" and "not yours" (ADR 0025).
    return (
      <div role="alert" className="grid justify-items-start gap-3">
        <p>Espaço não encontrado.</p>
        <Button asChild variant="outline">
          <Link to="/">Ver seus espaços</Link>
        </Button>
      </div>
    );
  }
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
