import {
  formatCents,
  loanCategoryLabels,
  MAX_SPLIT_PEOPLE,
  splitInstallments,
  type Person,
  type TransactionType,
} from '@financas/shared';
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
  installments,
  monthly,
  loan,
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
  /**
   * An installment plan (ADR 0052): the shares are in the meaning of the amount typed, of the
   * total or of each installment, and every installment gets its part of them.
   */
  installments?: { count: number; amountIs: 'TOTAL' | 'INSTALLMENT' };
  /**
   * A recurrence (ADR 0052): every month gets the shares. A variable amount takes percentages
   * only, which follow the real amount of each month.
   */
  /** Every month, or every year (ADR 0038 note). */
  monthly?: { variable: boolean; yearly?: boolean };
  /**
   * A loan (ADRs 0058, 0059): a debit ("Emprestado para") or a credit ("Peguei emprestado de") in a
   * loans category that says where the shares go. The amount starts all with them.
   */
  loan?: { returnsTo: string };
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
  const percentOnly = monthly?.variable === true;
  const count = shares.length;
  const lending = loan !== undefined;

  // A variable amount is split in percentages only: reais typed would not follow it.
  useEffect(() => {
    if (!percentOnly || mode === 'PERCENT') return;
    setValue('shareMode', 'PERCENT');
    // The numbers typed meant reais: start again from equal shares.
    evenShareValues(0, count, 'PERCENT', !lending).forEach((value, index) =>
      setValue(`shares.${index}.value`, value, { shouldValidate: false }),
    );
  }, [percentOnly, mode, count, lending, setValue]);

  // Keeps the shares equal while nobody typed one: as people come and go, and as the amount or
  // the unit changes.
  useEffect(() => {
    if (manual || count === 0 || (mode === 'REAIS' && totalCents === null)) return;
    evenShareValues(totalCents ?? 0, count, mode, !lending).forEach((value, index) =>
      setValue(`shares.${index}.value`, value, { shouldValidate: false }),
    );
  }, [manual, count, mode, totalCents, lending, setValue]);

  // "Sua parte: R$ 400,00 do total. Por parcela: Ana R$ 133,33. Cada pessoa vira…"
  const summary = (myCents: number) => {
    const meaning = monthly
      ? monthly.variable
        ? ' do valor estimado'
        : monthly.yearly
          ? ' por ano'
          : ' por mês'
      : !installments
        ? ''
        : installments.amountIs === 'TOTAL'
          ? ' do total'
          : ' por parcela';
    // Money lent is all theirs: no "Sua parte: R$ 0,00".
    const parts = lending && myCents === 0 ? [] : [`Sua parte: ${formatCents(myCents)}${meaning}.`];
    if (installments?.amountIs === 'TOTAL' && installments.count >= 2) {
      // Each share divided like the installments themselves, the leftover cents on the last.
      const each = shares.map((share, index) => {
        const [first = 0] = splitInstallments(cents[index] ?? 0, installments.count);
        return `${share.name} ${formatCents(first)}`;
      });
      const uneven = cents.some((value) => (value ?? 0) % installments.count !== 0);
      parts.push(
        `Por parcela: ${each.join('; ')}${uneven ? ', a última com os centavos que sobram' : ''}.`,
      );
    }
    const where = monthly
      ? monthly.yearly
        ? ' em cada ano'
        : ' em cada mês'
      : installments
        ? ' em cada parcela'
        : '';
    if (loan) {
      parts.push(
        `Cada pessoa vira um valor ${loanCategoryLabels[type].share}${where}, na categoria ${loan.returnsTo}. Sem vencimento, ele fica fora do Saldo previsto ${loanCategoryLabels[type].untilBack}.`,
      );
    } else
      parts.push(
        type === 'CREDIT'
          ? `Cada pessoa vira um valor a pagar${where}, na categoria Repasse.`
          : `Cada pessoa vira um valor a receber${where}, na categoria Reembolso.`,
      );
    if (monthly?.variable) {
      parts.push(`As partes acompanham o valor real de cada ${monthly.yearly ? 'ano' : 'mês'}.`);
    }
    return parts.join(' ');
  };

  const pickPeople = (picked: string[]) => {
    // Whoever stays keeps what was typed for them.
    const kept = new Map(shares.map((share) => [share.name, share.value]));
    replace(
      picked.slice(0, MAX_SPLIT_PEOPLE).map((name) => ({ name, value: kept.get(name) ?? '' })),
    );
  };

  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">
        {lending ? loanCategoryLabels[type].split : 'Dividir com alguém'}
      </legend>
      <div className="grid gap-1">
        <label htmlFor={whoId} className="text-sm font-medium">
          {lending ? loanCategoryLabels[type].who : 'Com quem?'}
        </label>
        <PeopleMultiSelect
          id={whoId}
          value={names}
          onChange={pickPeople}
          people={people}
          userId={userId}
          title={lending ? loanCategoryLabels[type].who : 'Com quem?'}
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
          {percentOnly ? (
            <p className="text-muted-foreground text-sm">
              Partes em %, porque o valor varia todo mês.
            </p>
          ) : (
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
          )}
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
                evenShareValues(totalCents ?? 0, fields.length, mode, !lending).forEach(
                  (value, index) =>
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
                : summary(mine)}
          </p>
        </>
      )}
    </fieldset>
  );
}
