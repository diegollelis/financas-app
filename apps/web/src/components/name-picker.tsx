import { normalizeName } from '@financas/shared';
import { ChevronDownIcon, Plus } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
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

/** Names match whatever the accents and case typed: "joao" finds "João". */
function matches(name: string, search: string) {
  return normalizeName(name).includes(normalizeName(search));
}

const sameName = (a: string, b: string) => normalizeName(a) === normalizeName(b);

const itemClass = 'min-h-11 text-base md:min-h-0 md:text-sm';

export interface NameGroup {
  /** Shown above the group; none for a single group. */
  heading?: string;
  /** `aliases`: other texts it is found by, as a merchant's in a statement (ADR 0055). */
  items: { id: string; name: string; aliases?: readonly string[] }[];
}

/**
 * A list of names to pick from, with a search that ignores accents and case and "Adicionar
 * 'Nome'" for a name not listed yet (ADRs 0052, 0053): the base of the person and merchant
 * pickers.
 */
export function NameList({
  groups,
  knownNames,
  isPicked,
  onPick,
  clearLabel,
  multiple,
  autoFocus,
  searchLabel,
  placeholder,
  emptyText,
  pickedText,
}: {
  groups: NameGroup[];
  /** Every name there is, archived ones too: one of them is never "new". */
  knownNames: string[];
  isPicked: (name: string) => boolean;
  /** A name from the list, or a new one typed. */
  onPick: (name: string) => void;
  /** Offers an item that empties the field ("Ninguém"), when given. */
  clearLabel?: string;
  /** Several names: a pick toggles and the list stays open. */
  multiple: boolean;
  autoFocus: boolean;
  /** Names the search field ("Buscar pessoa"). */
  searchLabel: string;
  placeholder: string;
  emptyText: string;
  /** Said after a picked name in a multiple list (", escolhida"): the check is only drawn. */
  pickedText?: string;
}) {
  const [search, setSearch] = useState('');
  const typed = search.trim();
  // A name nobody has, archived ones included: those come back when the name is saved.
  const isNew = typed !== '' && !knownNames.some((name) => sameName(name, typed));
  const shown = groups.filter((group) => group.items.length > 0);

  return (
    <Command
      filter={(_value, query, keywords) => (matches(keywords?.join(' ') ?? '', query) ? 1 : 0)}
      // Names the search field (cmdk labels its input with it).
      label={searchLabel}
      className="bg-transparent p-0 md:bg-popover md:p-1"
    >
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder={placeholder}
        autoFocus={autoFocus}
        // The whole 44px box is the target, not only the line of text.
        className="h-full self-stretch text-base md:text-sm"
      />
      <CommandList className="max-h-[50svh] md:max-h-72">
        {/* With a new name typed, "Adicionar" is there: the list is never empty then. */}
        {!isNew && <CommandEmpty>{emptyText}</CommandEmpty>}
        {shown.map((group) => (
          <CommandGroup
            key={group.heading ?? ''}
            heading={shown.length > 1 ? group.heading : undefined}
          >
            {group.items.map((entry) => {
              const picked = isPicked(entry.name);
              // Found by an alias, not by the name: says which one, so the result makes sense.
              const byAlias =
                typed && !matches(entry.name, typed)
                  ? entry.aliases?.find((alias) => matches(alias, typed))
                  : undefined;
              return (
                <CommandItem
                  key={entry.id}
                  value={entry.id}
                  keywords={[entry.name, ...(entry.aliases ?? [])]}
                  data-checked={picked}
                  onSelect={() => onPick(entry.name)}
                  className={itemClass}
                >
                  {byAlias ? (
                    <span className="grid">
                      <span>{entry.name}</span>
                      <span className="text-muted-foreground text-sm">{byAlias}</span>
                    </span>
                  ) : (
                    entry.name
                  )}
                  {multiple && picked && pickedText && (
                    <span className="sr-only">{pickedText}</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
        {/* Outside any group: cmdk hides a group whose items the search filtered out. */}
        {isNew && (
          <CommandItem
            // Always shown while the name is new: the filter would hide it otherwise.
            forceMount
            value="__new__"
            onSelect={() => {
              onPick(typed);
              // Ready for the next one when several are picked.
              setSearch('');
            }}
            className={itemClass}
          >
            <Plus aria-hidden />
            Adicionar “{typed}”
          </CommandItem>
        )}
        {clearLabel && !typed && (
          <CommandItem value="__none__" onSelect={() => onPick('')} className={itemClass}>
            {clearLabel}
          </CommandItem>
        )}
      </CommandList>
    </Command>
  );
}

/**
 * The button that opens a picker, shaped like the other fields: a popover from md, a sheet of its
 * own on the phone, which stays above the virtual keyboard (ADR 0036).
 */
export function PickerShell({
  id,
  text,
  placeholder,
  title,
  description,
  open,
  onOpenChange,
  list,
  footer,
  aria,
}: {
  id?: string;
  /** What the button shows; the placeholder when empty. */
  text: string;
  placeholder: boolean;
  /** The sheet's title and description, on the phone. */
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: (autoFocus: boolean) => ReactNode;
  /** Below the list in the phone's sheet (e.g. "Pronto"). */
  footer?: ReactNode;
  aria: { 'aria-invalid'?: boolean; 'aria-describedby'?: string };
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const trigger = (
    <button
      ref={triggerRef}
      id={id}
      type="button"
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      onClick={desktop ? undefined : () => onOpenChange(true)}
      className={cn(
        'border-input-border focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:hover:bg-input/50 flex h-11 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border bg-transparent py-2 pr-2 pl-2.5 text-left text-base outline-none focus-visible:ring-3 aria-invalid:ring-3 md:h-8 md:text-sm',
        placeholder && 'text-muted-foreground',
      )}
      {...aria}
    >
      <span className="line-clamp-1">{text}</span>
      <ChevronDownIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
    </button>
  );

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
          {list(true)}
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <>
      {trigger}
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        returnFocusTo={triggerRef}
        title={title}
        description={description}
      >
        {/* No autofocus: the keyboard would cover the list, and most picks need no typing. */}
        {list(false)}
        {footer}
      </ResponsiveDialog>
    </>
  );
}
