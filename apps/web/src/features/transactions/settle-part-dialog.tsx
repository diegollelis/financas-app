import {
  formatCents,
  isoDateSchema,
  reaisInputSchema,
  settledOnLabels,
  settlePartLabels,
  todayIso,
  type Transaction,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import type { RefObject } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { useDialogDirty } from '@/components/dialog-dirty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/error-message';
import { useSettlePart } from './use-transactions';

/** What is still pending, checked here as the API checks it: never more, never a future day. */
const partSchema = (pendingCents: number) =>
  z.object({
    amount: reaisInputSchema.refine((cents) => cents <= pendingCents, {
      message: `O valor passa do que está pendente (${formatCents(pendingCents)}).`,
    }),
    settledAt: isoDateSchema.refine((day) => day <= todayIso(), {
      message: 'A data não pode ser no futuro.',
    }),
  });

type PartSchema = ReturnType<typeof partSchema>;

/**
 * "Recebimento parcial" / "Pagamento parcial" (ADR 0057): someone pays back a loan bit by bit, or a debt is
 * paid in parts with no fixed amount. The part is launched as received or paid in the month of its
 * day, and the pending one keeps the rest; when nothing is left, it goes.
 */
export function SettlePartDialog({
  workspaceId,
  transaction,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: HTMLElement | null | RefObject<HTMLElement | null>;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={`${settlePartLabels[transaction.type].action}: ${transaction.description}`}
      description={`Pendente: ${formatCents(transaction.amountCents)}. O valor entra no mês da data, e o pendente diminui.`}
    >
      {/* Mounted on each opening: today's date, no error left over. */}
      {open && (
        <PartForm
          workspaceId={workspaceId}
          transaction={transaction}
          onDone={() => onOpenChange(false)}
        />
      )}
    </ResponsiveDialog>
  );
}

function PartForm({
  workspaceId,
  transaction,
  onDone,
}: {
  workspaceId: string;
  transaction: Transaction;
  onDone: () => void;
}) {
  const settlePart = useSettlePart(workspaceId);
  const labels = settlePartLabels[transaction.type];
  const pendingCents = transaction.amountCents;
  const { register, handleSubmit, formState, control } = useForm<
    z.input<PartSchema>,
    unknown,
    z.output<PartSchema>
  >({
    resolver: zodResolver(partSchema(pendingCents)),
    defaultValues: { amount: '', settledAt: todayIso() },
  });
  // Closing the dialog by mistake with something typed asks first.
  useDialogDirty(formState.isDirty);
  const typed = reaisInputSchema.safeParse(useWatch({ control, name: 'amount' }));
  const id = `settle-part-${transaction.id}`;

  const onSubmit = ({ amount, settledAt }: z.output<PartSchema>) =>
    settlePart.mutate(
      { id: transaction.id, amountCents: amount, settledAt },
      {
        onSuccess: () => {
          onDone();
          toast.success(`${formatCents(amount)} ${labels.done} de ${transaction.description}`);
        },
      },
    );

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <FormField
        id={`${id}-amount`}
        label={`${labels.amount} (R$)`}
        error={formState.errors.amount?.message}
      >
        <Input
          inputMode="decimal"
          autoComplete="off"
          className="tabular-nums"
          {...register('amount')}
        />
      </FormField>
      <FormField
        id={`${id}-day`}
        label={settledOnLabels[transaction.type]}
        error={formState.errors.settledAt?.message}
      >
        <Input type="date" max={todayIso()} {...register('settledAt')} />
      </FormField>
      {/* What the amount leaves, as it is typed; the errors themselves come on submitting. */}
      {typed.success && typed.data > 0 && typed.data <= pendingCents && (
        <p aria-live="polite" className="bg-accent rounded-md px-3 py-2 text-sm tabular-nums">
          {typed.data === pendingCents
            ? 'Quita o que falta: o pendente sai da lista.'
            : `Fica pendente ${formatCents(pendingCents - typed.data)}.`}
        </p>
      )}
      {settlePart.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(settlePart.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={settlePart.isPending}>
          {settlePart.isPending ? 'Salvando…' : labels.submit}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
