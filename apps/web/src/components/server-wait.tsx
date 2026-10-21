import { BrandLogo } from '@/components/brand-logo';
import { cn } from '@/lib/utils';

/**
 * The official CL symbol (ADR 0043, never redrawn) with rings leaving it, like a signal calling
 * the server: the mark stays still and legible, only the rings move. Still for whoever asks for
 * less motion. The rings grow to twice its box, so whoever places it leaves room around it.
 */
export function ServerWaitMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative grid shrink-0 place-items-center',
        "before:border-primary before:absolute before:inset-0 before:rounded-full before:border-2 before:opacity-0 before:content-[''] motion-safe:before:animate-ring",
        "after:border-brand-secondary after:absolute after:inset-0 after:rounded-full after:border-2 after:opacity-0 after:content-[''] motion-safe:after:animate-ring after:[animation-delay:1.2s]",
        className,
      )}
    >
      <BrandLogo variant="symbol" alt="" className="relative w-[85%]" />
    </span>
  );
}

/**
 * A thin bar that creeps to about 90% in a minute and never finishes on its own: it says time
 * is passing without claiming to know when the server answers. Shown only with motion, since
 * standing still it would say nothing.
 */
function WaitBar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-secondary block h-1 overflow-hidden rounded-full motion-reduce:hidden',
        className,
      )}
    >
      <span className="bg-primary animate-wait-bar block h-full w-0 rounded-full" />
    </span>
  );
}

/**
 * The wait after the first seconds: the mark, the step's words and the bar. `page` is a whole
 * page loading (BrandLoader), centered; `inline` sits above a view's skeletons (LoadingState).
 * Mounted when the wait is already slow, so the bar starts with the words.
 */
export function ServerWait({ message, layout }: { message: string; layout: 'page' | 'inline' }) {
  if (layout === 'page') {
    return (
      <div className="grid justify-items-center gap-3">
        <p>{message}</p>
        <WaitBar className="w-48" />
      </div>
    );
  }
  return (
    <div className="bg-card flex items-center gap-4 rounded-xl border px-4 py-3.5">
      <ServerWaitMark className="m-2 size-9" />
      <div className="grid gap-2">
        <p className="text-muted-foreground">{message}</p>
        <WaitBar className="w-40" />
      </div>
    </div>
  );
}
