import { formatCents, MAX_SPLIT_PEOPLE, type Person, type TransactionType } from '@financas/shared';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PeopleMultiSelect } from '@/features/people/person-picker';
import { evenShareValues, myShareCents, shareCents, type ShareMode } from './split';

/** The part of the transaction form these fields read and write. */
export interface SplitFormFields {
  amount: string;
  shareMode: ShareMode;
  shares: { name: string; value: string }[];
}

const modeOptions = [
  { value: 'REAIS', label: 'Em reais' },
  { value: 'PERCENT', label: 'Em %' },
] as const;

/**
 * "Dividir com alguém" (ADRs 0042, 0052): "Com quem?" picks several people at once, and each one
 * gets a row with their name and their share, typed in reais or as a percentage. The shares start
 * equal, you included, and follow the amount and the people picked until one is typed by hand;
 * "Dividir igualmente" goes back to equal shares. A new name becomes a person when the
 * transaction is saved.
 */
export function SplitFields({
  idPrefix,
  control,
  register,
  setValue,
  errors,
  totalCents,
  type,
  people,
  userId,
}: {
  idPrefix: string;
  control: Control<SplitFormFields>;
  register: UseFormRegister<SplitFormFields>;
  setValue: UseFormSetValue<SplitFormFields>;
  errors: FieldErrors<SplitFormFields>;
  /** The amount typed, in cents; null while it is not a valid one. */
  totalCents: number | null;
  /** The side of the transaction: its shares go on the other one (ADR 0052). */
  type: TransactionType;
  /** The workspace's people, offered in "Com quem?". */
  people: Person[];
  /** The signed-in user, never offered. */
  userId: string;
}) {
  const { fields, replace, remove } = useFieldArray({ control, name: 'shares' });
  const mode = useWatch({ control, name: 'shareMode' });
  const shares = useWatch({ control, name: 'shares' });
  // Equal shares until one is typed by hand.
  const [manual, setManual] = useState(false);
  const cents = shares.map((share) => shareCents(totalCents, share.value, mode));
  const mine = myShareCents(totalCents, cents);
  const unit = mode === 'REAIS' ? 'R$' : '%';
  const names = shares.map((share) => share.name);
  const whoId = `${idPrefix}-split-who`;
  const whoError = errors.shares?.root?.message ?? errors.shares?.message;

  // Keeps the shares equal while nobody typed one: as people come and go, and as the amount or
  // the unit changes.
  const count = shares.length;
  useEffect(() => {
    if (manual || count === 0 || (mode === 'REAIS' && totalCents === null)) return;
    evenShareValues(totalCents ?? 0, count, mode).forEach((value, index) =>
      setValue(`shares.${index}.value`, value, { shouldValidate: false }),
    );
  }, [manual, count, mode, totalCents, setValue]);

  const pickPeople = (picked: string[]) => {
    // Whoever stays keeps what was typed for them.
    const kept = new Map(shares.map((share) => [share.name, share.value]));
    replace(
      picked.slice(0, MAX_SPLIT_PEOPLE).map((name) => ({ name, value: kept.get(name) ?? '' })),
    );
  };

  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">Dividir com alguém</legend>
      <div className="grid gap-1">
        <label htmlFor={whoId} className="text-sm font-medium">
          Com quem?
        </label>
        <PeopleMultiSelect
          id={whoId}
          value={names}
          onChange={pickPeople}
          people={people}
          userId={userId}
          title="Com quem?"
          aria-invalid={whoError ? true : undefined}
          aria-describedby={whoError ? `${whoId}-error` : undefined}
        />
        {whoError && (
          <p id={`${whoId}-error`} role="alert" className="text-destructive text-sm">
            {whoError}
          </p>
        )}
      </div>
      {fields.length > 0 && (
        <>
          <Controller
            control={control}
            name="shareMode"
            render={({ field }) => (
              <SegmentedControl
                label="Partes"
                options={modeOptions}
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  // The numbers typed meant the other unit: start again from equal shares.
                  setManual(false);
                }}
              />
            )}
          />
          <ul className="grid gap-3">
            {fields.map((field, index) => {
              const name = shares[index]?.name ?? field.name;
              const valueError = errors.shares?.[index]?.value?.message;
              const valueId = `${idPrefix}-share-${index}-value`;
              const { onChange, ...valueProps } = register(`shares.${index}.value`);
              return (
                <li
                  key={field.id}
                  className="grid grid-cols-[minmax(0,1fr)_7.5rem_auto] items-center gap-2"
                >
                  {/* The input is named "Parte de Ana (R$)"; the name is its visible label. */}
                  <label htmlFor={valueId} className="font-medium break-words">
                    {name}
                  </label>
                  <Input
                    id={valueId}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={mode === 'REAIS' ? '0,00' : '50'}
                    aria-label={`Parte de ${name} (${unit})`}
                    className="tabular-nums"
                    aria-invalid={valueError ? true : undefined}
                    aria-describedby={valueError ? `${valueId}-error` : undefined}
                    onChange={(event) => {
                      setManual(true);
                      void onChange(event);
                    }}
                    {...valueProps}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Tirar ${name} da divisão`}
                    onClick={() => remove(index)}
                  >
                    <X aria-hidden />
                  </Button>
                  {valueError && (
                    <p id={`${valueId}-error`} className="text-destructive col-span-3 text-sm">
                      {valueError}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={totalCents === null && mode === 'REAIS'}
              onClick={() => {
                setManual(false);
                evenShareValues(totalCents ?? 0, fields.length, mode).forEach((value, index) =>
                  setValue(`shares.${index}.value`, value, { shouldValidate: true }),
                );
              }}
            >
              Dividir igualmente
            </Button>
          </div>
          <p aria-live="polite" className="text-muted-foreground text-sm">
            {mine === null
              ? 'Informe o valor e a parte de cada pessoa.'
              : mine < 0
                ? 'As partes dos outros passam do valor do lançamento.'
                : type === 'CREDIT'
                  ? `Sua parte: ${formatCents(mine)}. Cada pessoa vira um valor a pagar, na categoria Repasse.`
                  : `Sua parte: ${formatCents(mine)}. Cada pessoa vira um valor a receber, na categoria Reembolso.`}
          </p>
        </>
      )}
    </fieldset>
  );
}
