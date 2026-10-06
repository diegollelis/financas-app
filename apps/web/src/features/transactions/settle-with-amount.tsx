import { reaisInputSchema, type Transaction } from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import type { RefObject } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/error-message';

const settleSchema = z.object({ amount: reaisInputSchema });

/** 18990 → "189,90": the estimate, as the person would type it. */
const amountText = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });

/**
 * Settling a bill whose amount was estimated (ADR 0038): the bill's real amount is asked here,
 * filled with the estimate, and amount and date go together. Fixed ones settle in one tap.
 */
export function SettleWithAmount({
  transaction,
  open,
  onOpenChange,
  returnFocusTo,
  pending,
  error,
  onSettle,
}: {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
  pending: boolean;
  error: unknown;
  onSettle: (amountCents: number) => void;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={`Efetivar ${transaction.description}`}
      description="O valor muda todo mês: confira o valor da fatura antes de efetivar."
    >
      {/* Mounted on each opening: the estimate of now, no error left over. */}
      {open && (
        <SettleForm
          transaction={transaction}
          pending={pending}
          error={error}
          onSettle={onSettle}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </ResponsiveDialog>
  );
}

function SettleForm({
  transaction,
  pending,
  error,
  onSettle,
  onCancel,
}: {
  transaction: Transaction;
  pending: boolean;
  error: unknown;
  onSettle: (amountCents: number) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState } = useForm<
    z.input<typeof settleSchema>,
    unknown,
    z.output<typeof settleSchema>
  >({
    resolver: zodResolver(settleSchema),
    defaultValues: { amount: amountText.format(transaction.amountCents / 100) },
  });
  const id = `settle-${transaction.id}`;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void handleSubmit(({ amount }) => onSettle(amount))(event)}
    >
      <FormField id={id} label="Valor da fatura (R$)" error={formState.errors.amount?.message}>
        <Input
          inputMode="decimal"
          autoComplete="off"
          className="tabular-nums"
          {...register('amount')}
        />
      </FormField>
      {Boolean(error) && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={pending}>
          {pending ? 'Efetivando…' : 'Efetivar'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
