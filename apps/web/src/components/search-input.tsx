import { Search, X } from 'lucide-react';
import { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The search over a page's list: a magnifier and a hint of what it looks in, inside the field, so
 * it reads as a search and not as a form field to fill (ADR 0036 note). The label stays for
 * screen readers only, since the hint is gone once something is typed. With text, a button clears
 * it (the native one shows only in Chrome, and small), a 44px target on the phone, and gives the
 * focus back to the field.
 */
export function SearchInput({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="grid">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <div className="relative">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 md:left-2.5 md:size-4"
        />
        <Input
          ref={input}
          id={id}
          type="search"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-11 pl-10 md:pr-9 md:pl-8 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value !== '' && (
          <button
            type="button"
            aria-label="Limpar busca"
            aria-controls={id}
            onClick={() => {
              onChange('');
              input.current?.focus();
            }}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg outline-none focus-visible:ring-3 focus-visible:ring-inset md:w-8"
          >
            <X aria-hidden className="size-5 md:size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
