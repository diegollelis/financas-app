import { formatCents, MAX_SPLIT_PEOPLE } from '@financas/shared';
import { Plus, X } from 'lucide-react';
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
 * "Dividir com alguém" (ADR 0042): who else pays part of this debit, and how much, typed in
 * reais or as a percentage. Shows what stays yours as it is typed, and splits equally on request
 * (the cents left over stay in yours). Names already listed are suggested; a new one becomes a
 * person when the transaction is saved.
 */
export function SplitFields({
  idPrefix,
  control,
  register,
  setValue,
  errors,
  totalCents,
  peopleListId,
}: {
  idPrefix: string;
  control: Control<SplitFormFields>;
  register: UseFormRegister<SplitFormFields>;
  setValue: UseFormSetValue<SplitFormFields>;
  errors: FieldErrors<SplitFormFields>;
  /** The amount typed, in cents; null while it is not a valid one. */
  totalCents: number | null;
  /** The <datalist> with the names of the workspace's people. */
  peopleListId: string;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'shares' });
  const mode = useWatch({ control, name: 'shareMode' });
  const shares = useWatch({ control, name: 'shares' });
  const cents = shares.map((share) => shareCents(totalCents, share.value, mode));
  const mine = myShareCents(totalCents, cents);
  const unit = mode === 'REAIS' ? 'R$' : '%';
  const splitEqually = () =>
    evenShareValues(totalCents ?? 0, fields.length, mode).forEach((value, index) =>
      setValue(`shares.${index}.value`, value, { shouldValidate: true }),
    );

  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">Dividir com alguém</legend>
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
              // The numbers typed meant the other unit.
              fields.forEach((_, index) => setValue(`shares.${index}.value`, ''));
            }}
          />
        )}
      />
      <ul className="grid gap-3">
        {fields.map((field, index) => {
          const nameError = errors.shares?.[index]?.name?.message;
          const valueError = errors.shares?.[index]?.value?.message;
          const nameId = `${idPrefix}-share-${index}-name`;
          const valueId = `${idPrefix}-share-${index}-value`;
          return (
            <li key={field.id} className="grid grid-cols-[1fr_7.5rem_auto] items-start gap-2">
              <div className="grid gap-1">
                <label htmlFor={nameId} className="text-sm font-medium">
                  Pessoa {index + 1}
                </label>
                <Input
                  id={nameId}
                  list={peopleListId}
                  autoComplete="off"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? `${nameId}-error` : undefined}
                  {...register(`shares.${index}.name`)}
                />
                {nameError && (
                  <p id={`${nameId}-error`} className="text-destructive text-sm">
                    {nameError}
                  </p>
                )}
              </div>
              <div className="grid gap-1">
                <label htmlFor={valueId} className="text-sm font-medium">
                  Parte ({unit})
                </label>
                <Input
                  id={valueId}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={mode === 'REAIS' ? '0,00' : '50'}
                  className="tabular-nums"
                  aria-invalid={valueError ? true : undefined}
                  aria-describedby={valueError ? `${valueId}-error` : undefined}
                  {...register(`shares.${index}.value`)}
                />
                {valueError && (
                  <p id={`${valueId}-error`} className="text-destructive text-sm">
                    {valueError}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-6"
                aria-label={`Tirar a pessoa ${index + 1}`}
                disabled={fields.length === 1}
                onClick={() => remove(index)}
              >
                <X aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fields.length >= MAX_SPLIT_PEOPLE}
          onClick={() => append({ name: '', value: '' })}
        >
          <Plus aria-hidden />
          Adicionar pessoa
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={totalCents === null}
          onClick={splitEqually}
        >
          Dividir igualmente
        </Button>
      </div>
      {errors.shares?.root?.message && (
        <p role="alert" className="text-destructive text-sm">
          {errors.shares.root.message}
        </p>
      )}
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {mine === null
          ? 'Informe o valor e a parte de cada pessoa.'
          : mine < 0
            ? 'As partes dos outros passam do valor do lançamento.'
            : `Sua parte: ${formatCents(mine)}. Cada pessoa vira um valor a receber, na categoria Reembolso.`}
      </p>
    </fieldset>
  );
}
