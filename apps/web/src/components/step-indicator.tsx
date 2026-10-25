import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Where a flow of a few steps is (the import's "Arquivo → Revisão → Importado"): the steps before
 * the current one done, the current one marked for assistive technology too.
 */
export function StepIndicator({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol
      aria-label="Etapas"
      className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm"
    >
      {steps.map((step, index) => {
        const done = index < current;
        const now = index === current;
        return (
          <li
            key={step}
            aria-current={now ? 'step' : undefined}
            className={cn('flex items-center gap-2', now && 'text-foreground font-medium')}
          >
            {index > 0 && <span aria-hidden className="bg-border h-px w-4" />}
            <span
              aria-hidden
              className={cn(
                'border-input-border flex size-5 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-primary bg-primary text-primary-foreground',
                now && 'border-primary text-primary',
              )}
            >
              {done ? <Check className="size-3" /> : index + 1}
            </span>
            {step}
            {done && <span className="sr-only">(concluída)</span>}
          </li>
        );
      })}
    </ol>
  );
}
