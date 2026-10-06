import type { ComponentProps } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * A link that reads as text ("Cadastre-se", "Esqueci minha senha") but is a 44px target on the
 * phone (ADR 0036): the height grows, the text does not. Compact from md.
 */
export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        'text-primary focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 md:min-h-0',
        className,
      )}
      {...props}
    />
  );
}
