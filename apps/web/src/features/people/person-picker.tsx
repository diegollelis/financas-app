import { normalizeName, type Person } from '@financas/shared';
import { ChevronDownIcon, Plus } from 'lucide-react';
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

/** Names match whatever the accents and case typed: "joao" finds "João". */
function matches(name: string, search: string) {
  return normalizeName(name).includes(normalizeName(search));
}

/**
 * Who can be picked (ADR 0052): the active people, members of the workspace apart, never you.
 * A member's person carries the account's name (ADR 0042 note).
 */
function pickablePeople(people: Person[], userId: string) {
  const active = people.filter((person) => !person.archived && person.memberUserId !== userId);
  return {
    members: active.filter((person) => person.isMember),
    others: active.filter((person) => !person.isMember),
  };
}

function PersonList({
  people,
  userId,
  value,
  optional,
  onPick,
  autoFocus,
}: {
  people: Person[];
  userId: string;
  value: string;
  optional: boolean;
  onPick: (name: string) => void;
  autoFocus: boolean;
}) {
  const [search, setSearch] = useState('');
  const { members, others } = pickablePeople(people, userId);
  const typed = search.trim();
  // A name nobody has, archived ones included: those come back when the name is saved.
  const isNew =
    typed !== '' && !people.some((person) => normalizeName(person.name) === normalizeName(typed));
  const item = (person: Person) => (
    <CommandItem
      key={person.id}
      value={person.id}
      keywords={[person.name]}
      data-checked={normalizeName(person.name) === normalizeName(value)}
      onSelect={() => onPick(person.name)}
      className="min-h-11 text-base md:min-h-0 md:text-sm"
    >
      {person.name}
    </CommandItem>
  );

  return (
    <Command
      filter={(_value, query, keywords) => (matches(keywords?.join(' ') ?? '', query) ? 1 : 0)}
      // Names the search field (cmdk labels its input with it).
      label="Buscar pessoa"
      className="bg-transparent p-0 md:bg-popover md:p-1"
    >
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Buscar ou adicionar pessoa"
        autoFocus={autoFocus}
        // The whole 44px box is the target, not only the line of text.
        className="h-full self-stretch text-base md:text-sm"
      />
      <CommandList className="max-h-[50svh] md:max-h-72">
        {/* With a new name typed, "Adicionar" is there: the list is never empty then. */}
        {!isNew && <CommandEmpty>Digite o nome de alguém para adicionar.</CommandEmpty>}
        {members.length > 0 && <CommandGroup heading="Membros">{members.map(item)}</CommandGroup>}
        {others.length > 0 && (
          <CommandGroup heading={members.length > 0 ? 'Pessoas' : undefined}>
            {others.map(item)}
          </CommandGroup>
        )}
        {/* Outside any group: cmdk hides a group whose items the search filtered out. */}
        {isNew && (
          <CommandItem
            // Always shown while the name is new: the filter would hide it otherwise.
            forceMount
            value="__new__"
            onSelect={() => onPick(typed)}
            className="min-h-11 text-base md:min-h-0 md:text-sm"
          >
            <Plus aria-hidden />
            Adicionar “{typed}”
          </CommandItem>
        )}
        {optional && value && !typed && (
          <CommandItem
            value="__none__"
            onSelect={() => onPick('')}
            className="min-h-11 text-base md:min-h-0 md:text-sm"
          >
            Ninguém
          </CommandItem>
        )}
      </CommandList>
    </Command>
  );
}

/**
 * The person field (ADR 0052), shaped like the category one: a search over the names, members of
 * the workspace apart, and "Adicionar 'Nome'" for someone not listed yet. Its value is a name:
 * the form resolves it on save, a new one becoming a person then (ADR 0042). A popover from md;
 * on the phone a sheet of its own (ADR 0036). FormField hands it the id and the error wiring.
 */
export function PersonSelect({
  id,
  value,
  onChange,
  people,
  userId,
  optional = false,
  title,
  ...aria
}: {
  id?: string;
  value: string;
  onChange: (name: string) => void;
  people: Person[];
  /** The signed-in user, left out of the list. */
  userId: string;
  /** Offers "Ninguém" to clear the field. */
  optional?: boolean;
  /** The title of the sheet on the phone. */
  title: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };
  const list = (autoFocus: boolean) => (
    <PersonList
      people={people}
      userId={userId}
      value={value}
      optional={optional}
      onPick={pick}
      autoFocus={autoFocus}
    />
  );

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
        'border-input-border focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:hover:bg-input/50 flex h-11 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border bg-transparent py-2 pr-2 pl-2.5 text-left text-base outline-none focus-visible:ring-3 aria-invalid:ring-3 md:h-8 md:text-sm',
        !value && 'text-muted-foreground',
      )}
      {...aria}
    >
      <span className="line-clamp-1">{value || (optional ? 'Ninguém' : 'Escolha…')}</span>
      <ChevronDownIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
    </button>
  );

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
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
        onOpenChange={setOpen}
        returnFocusTo={triggerRef}
        title={title}
        description="Toque numa pessoa, ou digite um nome para buscar ou adicionar."
      >
        {/* No autofocus: the keyboard would cover the list, and most picks need no typing. */}
        {list(false)}
      </ResponsiveDialog>
    </>
  );
}
