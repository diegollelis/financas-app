import { ServerWait, ServerWaitMark } from '@/components/server-wait';
import { useServerWaitMessage } from '@/lib/use-server-wait';

/**
 * A whole page loading (opening the app, the invitation): the official CL symbol, never redrawn
 * (ADR 0043), with rings leaving it, and still for whoever asks for less motion. After a few
 * seconds it says why, in steps, with a bar: on Render's free plan the API takes up to a minute
 * to answer (ADR 0033, ADR 0036 note). Lists and blocks inside a page keep their skeletons.
 */
export function BrandLoader() {
  const message = useServerWaitMessage();
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      {/* Room around it: the rings grow to twice its size. */}
      <ServerWaitMark className="m-8 size-16" />
      <div role="status" className="text-muted-foreground min-h-14 max-w-xs">
        <span className="sr-only">Carregando…</span>
        {message && <ServerWait message={message} layout="page" />}
      </div>
    </main>
  );
}
