import { normalizeName, type Category } from '@financas/shared';
import { ChevronDownIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { mostUsed } from './most-used';

const label = (category: Category) =>
  category.archived ? `${category.name} (arquivada)` : category.name;

/** Names match whatever the accents and case typed: "agua" finds "Água". */
function matches(name: string, search: string) {
  return normalizeName(name).includes(normalizeName(search));
}

function CategoryList({
  options,
  value,
  onPick,
  autoFocus,
}: {
  options: Category[];
  value: string;
  onPick: (id: string) => void;
  autoFocus: boolean;
}) {
  const [search, setSearch] = useState('');
  // While searching, only the full list: the group would show the same names twice.
  const top = search ? [] : mostUsed(options);
  const item = (category: Category, group: string) => (
    <CommandItem
      key={`${group}-${category.id}`}
      // Unique per group; the search reads `keywords`.
      value={`${group}-${category.id}`}
      keywords={[category.name]}
      data-checked={category.id === value}
      onSelect={() => onPick(category.id)}
      className="min-h-11 text-base md:min-h-0 md:text-sm"
    >
      {label(category)}
    </CommandItem>
  );

  return (
    <Command
      filter={(_value, typed, keywords) => (matches(keywords?.join(' ') ?? '', typed) ? 1 : 0)}
      // Names the search field (cmdk labels its input with it).
      label="Buscar categoria"
      className="bg-transparent p-0 md:bg-popover md:p-1"
    >
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Buscar categoria"
        autoFocus={autoFocus}
        // The whole 44px box is the target, not only the line of text.
        className="h-full self-stretch text-base md:text-sm"
      />
      <CommandList className="max-h-[50svh] md:max-h-72">
        <CommandEmpty>Nenhuma categoria com esse nome.</CommandEmpty>
        {top.length > 0 && (
          <CommandGroup heading="Mais usadas">
            {top.map((category) => item(category, 'top'))}
          </CommandGroup>
        )}
        <CommandGroup heading={top.length > 0 ? 'Todas' : undefined}>
          {options.map((category) => item(category, 'all'))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/**
 * The category field: a search over the names, with the most used ones first. A popover from md;
 * on the phone a sheet of its own, which stays above the virtual keyboard (ADR 0036). FormField
 * hands it the id and the error wiring for its trigger. `options` come already filtered by type.
 */
export function CategorySelect({
  id,
  value,
  onChange,
  options,
  ...aria
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Category[];
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((category) => category.id === value);
  const pick = (categoryId: string) => {
    onChange(categoryId);
    setOpen(false);
  };

  const trigger = (
    <button
      ref={triggerRef}
      id={id}
      type="button"
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      onClick={desktop ? undefined : () => setOpen(true)}
      className={cn(
        'border-input-border focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:hover:bg-input/50 flex h-11 w-full items-center justify-between gap-1.5 rounded-lg border bg-transparent py-2 pr-2 pl-2.5 text-left text-base outline-none focus-visible:ring-3 aria-invalid:ring-3 md:h-8 md:text-sm',
        !selected && 'text-muted-foreground',
      )}
      {...aria}
    >
      <span className="line-clamp-1">{selected ? label(selected) : 'Escolha…'}</span>
      <ChevronDownIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
    </button>
  );

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
          <CategoryList options={options} value={value} onPick={pick} autoFocus />
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <>
      {trigger}
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        returnFocusTo={triggerRef}
        title="Escolher categoria"
        description="Toque numa categoria ou busque pelo nome."
      >
        {/* No autofocus: the keyboard would cover the list, and most picks need no typing. */}
        <CategoryList options={options} value={value} onPick={pick} autoFocus={false} />
      </ResponsiveDialog>
    </>
  );
}
