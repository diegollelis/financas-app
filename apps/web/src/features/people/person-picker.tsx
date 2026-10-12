import { normalizeName, type Person } from '@financas/shared';
import { ChevronDownIcon, Plus } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
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

const itemClass = 'min-h-11 text-base md:min-h-0 md:text-sm';

function PersonList({
  people,
  userId,
  isPicked,
  onPick,
  clearLabel,
  multiple,
  autoFocus,
}: {
  people: Person[];
  userId: string;
  isPicked: (name: string) => boolean;
  /** A name from the list, or a new one typed. */
  onPick: (name: string) => void;
  /** Offers an item that empties the field ("Ninguém"), when given. */
  clearLabel?: string;
  /** Several people: a pick toggles and the list stays open. */
  multiple: boolean;
  autoFocus: boolean;
}) {
  const [search, setSearch] = useState('');
  const { members, others } = pickablePeople(people, userId);
  const typed = search.trim();
  // A name nobody has, archived ones included: those come back when the name is saved.
  const isNew = typed !== '' && !people.some((person) => sameName(person.name, typed));
  const item = (person: Person) => {
    const picked = isPicked(person.name);
    return (
      <CommandItem
        key={person.id}
        value={person.id}
        keywords={[person.name]}
        data-checked={picked}
        onSelect={() => onPick(person.name)}
        className={itemClass}
      >
        {person.name}
        {/* The check mark is only drawn: say it too. */}
        {multiple && picked && <span className="sr-only">, escolhida</span>}
      </CommandItem>
    );
  };

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
function PickerShell({
  id,
  text,
  placeholder,
  title,
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
  title: string;
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
        description="Toque numa pessoa, ou digite um nome para buscar ou adicionar."
      >
        {/* No autofocus: the keyboard would cover the list, and most picks need no typing. */}
        {list(false)}
        {footer}
      </ResponsiveDialog>
    </>
  );
}

/**
 * The person field (ADR 0052), shaped like the category one: a search over the names, members of
 * the workspace apart, and "Adicionar 'Nome'" for someone not listed yet. Its value is a name:
 * the form resolves it on save, a new one becoming a person then (ADR 0042). FormField hands it
 * the id and the error wiring.
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
  const [open, setOpen] = useState(false);
  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <PickerShell
      id={id}
      text={value || (optional ? 'Ninguém' : 'Escolha…')}
      placeholder={!value}
      title={title}
      open={open}
      onOpenChange={setOpen}
      aria={aria}
      list={(autoFocus) => (
        <PersonList
          people={people}
          userId={userId}
          isPicked={(name) => sameName(name, value)}
          onPick={pick}
          clearLabel={optional && value ? 'Ninguém' : undefined}
          multiple={false}
          autoFocus={autoFocus}
        />
      )}
    />
  );
}

/**
 * "Com quem?" (ADR 0052): several people at once, each pick toggling a name, the list staying
 * open; "Adicionar 'Nome'" adds someone not listed yet. Its value is the names, in the order
 * they were picked.
 */
export function PeopleMultiSelect({
  id,
  value,
  onChange,
  people,
  userId,
  title,
  ...aria
}: {
  id?: string;
  value: string[];
  onChange: (names: string[]) => void;
  people: Person[];
  /** The signed-in user, left out of the list. */
  userId: string;
  /** The title of the sheet on the phone. */
  title: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (name: string) => {
    if (!name) return;
    onChange(
      value.some((picked) => sameName(picked, name))
        ? value.filter((picked) => !sameName(picked, name))
        : [...value, name],
    );
  };
  const count = value.length;

  return (
    <PickerShell
      id={id}
      text={count === 0 ? 'Escolher pessoas' : count === 1 ? '1 pessoa' : `${count} pessoas`}
      placeholder={count === 0}
      title={title}
      open={open}
      onOpenChange={setOpen}
      aria={aria}
      list={(autoFocus) => (
        <PersonList
          people={people}
          userId={userId}
          isPicked={(name) => value.some((picked) => sameName(picked, name))}
          onPick={toggle}
          multiple
          autoFocus={autoFocus}
        />
      )}
      footer={
        <Button type="button" className="mt-3 w-full" onClick={() => setOpen(false)}>
          Pronto
        </Button>
      }
    />
  );
}
