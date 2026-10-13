import { normalizeName, type Person } from '@financas/shared';
import { useState } from 'react';
import { NameList, PickerShell } from '@/components/name-picker';

const sameName = (a: string, b: string) => normalizeName(a) === normalizeName(b);
import { Button } from '@/components/ui/button';

const SHEET_DESCRIPTION = 'Toque numa pessoa, ou digite um nome para buscar ou adicionar.';

/**
 * Who can be picked (ADR 0052): the active people, members of the workspace apart, never you.
 * A member's person carries the account's name (ADR 0042 note).
 */
function PersonList({
  people,
  userId,
  ...props
}: {
  people: Person[];
  userId: string;
  isPicked: (name: string) => boolean;
  onPick: (name: string) => void;
  clearLabel?: string;
  multiple: boolean;
  autoFocus: boolean;
}) {
  const active = people.filter((person) => !person.archived && person.memberUserId !== userId);
  return (
    <NameList
      groups={[
        { heading: 'Membros', items: active.filter((person) => person.isMember) },
        { heading: 'Pessoas', items: active.filter((person) => !person.isMember) },
      ]}
      knownNames={people.map((person) => person.name)}
      searchLabel="Buscar pessoa"
      placeholder="Buscar ou adicionar pessoa"
      emptyText="Digite o nome de alguém para adicionar."
      pickedText=", escolhida"
      {...props}
    />
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
      description={SHEET_DESCRIPTION}
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
      description={SHEET_DESCRIPTION}
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
