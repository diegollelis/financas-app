import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A password field with a button that shows what was typed: on the phone a mistyped password is
 * only found out after the server refuses it. Takes every prop of `Input` (the id, the aria
 * attributes from `FormField`, React Hook Form's `register`). The button is a 44px target on the
 * phone, and its name says what a press does.
 */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={cn('pr-11 md:pr-9', className)}
      />
      <button
        type="button"
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-controls={props.id}
        onClick={() => setVisible((shown) => !shown)}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg outline-none focus-visible:ring-3 md:w-8"
      >
        {visible ? (
          <EyeOff aria-hidden className="size-5 md:size-4" />
        ) : (
          <Eye aria-hidden className="size-5 md:size-4" />
        )}
      </button>
    </div>
  );
}
