import {
  formatCents,
  formatIsoDate,
  formatPeriod,
  isoDateSchema,
  periodSchema,
  shiftPeriod,
  type Transaction,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type RefObject } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { useDialogDirty } from '@/components/dialog-dirty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCards } from '@/features/cards/use-cards';
import { PeriodPicker } from '@/features/periods/period-picker';
import { apiErrorMessage } from '@/lib/error-message';
import { movedDueDate, targetMonthText } from './move-period';
import { useUpdateTransaction } from './use-transactions';

const moveSchema = z.object({
  period: periodSchema,
  // Blank: no due date.
  dueDate: z.union([z.literal(''), isoDateSchema]),
});

type MoveValues = z.infer<typeof moveSchema>;

/**
 * "Mover para outro mês" (ADR 0029 note): a transaction launched once goes to another
 * competência, its due date along, as when the bank puts a purchase on the next bill. The pending
 * shares of a split one go with it.
 */
export function MovePeriodDialog({
  workspaceId,
  transaction,
  shares,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  transaction: Transaction;
  /** Its shares, said in the dialog: they go with it. */
  shares: { name: string; amountCents: number }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: HTMLElement | null | RefObject<HTMLElement | null>;
}) {
  const due = transaction.dueDate
    ? `com vencimento em ${formatIsoDate(transaction.dueDate)}`
    : 'sem vencimento';
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={`Mover para outro mês: ${transaction.description}`}
      description={`Hoje em ${formatPeriod(transaction.period)}, ${due}.`}
    >
      {/* Mounted on each opening: the next month again, no error left over. */}
      {open && (
        <MoveForm
          workspaceId={workspaceId}
          transaction={transaction}
          shares={shares}
          onDone={() => onOpenChange(false)}
        />
      )}
    </ResponsiveDialog>
  );
}

function MoveForm({
  workspaceId,
  transaction,
  shares,
  onDone,
}: {
  workspaceId: string;
  transaction: Transaction;
  shares: { name: string; amountCents: number }[];
  onDone: () => void;
}) {
  const update = useUpdateTransaction(workspaceId);
  const cards = useCards(workspaceId);
  // The bill's days of the card it was bought on, in Crédito (ADR 0062).
  const card =
    transaction.paymentMethod === 'CREDIT_CARD'
      ? (cards.data?.find((item) => item.id === transaction.cardId) ?? null)
      : null;
  const billOf = card?.closingDay != null && card.dueDay != null ? card.name : null;
  const firstTarget = shiftPeriod(transaction.period, 1);
  const { register, handleSubmit, formState, control, setValue } = useForm<MoveValues>({
    resolver: zodResolver(moveSchema),
    defaultValues: {
      period: firstTarget,
      dueDate: movedDueDate(transaction, firstTarget, card) ?? '',
    },
  });
  useDialogDirty(formState.isDirty);
  const [picking, setPicking] = useState(false);
  // The due date follows the month chosen until it is typed by hand.
  const dueTyped = formState.dirtyFields.dueDate === true;
  const target = useWatch({ control, name: 'period' });
  const same = target === transaction.period;
  const id = `move-${transaction.id}`;

  const choose = (period: string) => {
    setValue('period', period, { shouldDirty: true });
    if (!dueTyped) setValue('dueDate', movedDueDate(transaction, period, card) ?? '');
  };

  // The row leaves the month on screen, and the dialog closes: `mutate`'s own callbacks would be
  // skipped once they unmount, so the toasts follow `mutateAsync`.
  const back = { period: transaction.period, dueDate: transaction.dueDate };
  const undo = {
    label: 'Desfazer',
    onClick: () =>
      update.mutateAsync({ id: transaction.id, ...back }).then(
        () => toast.success(`${transaction.description} voltou para ${formatPeriod(back.period)}`),
        (error: unknown) => toast.error(apiErrorMessage(error)),
      ),
  };
  const onSubmit = ({ period, dueDate }: MoveValues) =>
    update.mutateAsync({ id: transaction.id, period, dueDate: dueDate || null }).then(
      () => {
        onDone();
        toast.success(`${transaction.description} movido para ${formatPeriod(period)}`, {
          action: undo,
        });
      },
      // Said in the dialog, from `update.error`.
      () => undefined,
    );

  const sharesText =
    shares.length === 1
      ? `A parte de ${shares[0]!.name} (${formatCents(shares[0]!.amountCents)}) vai junto para ${targetMonthText(transaction.period, target)}.`
      : `As partes de ${shares.map((share) => share.name).join(', ')} vão junto para ${targetMonthText(transaction.period, target)}.`;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <div className="grid gap-2">
        <p id={`${id}-period`} className="text-sm font-medium">
          Mês
        </p>
        <div role="group" aria-labelledby={`${id}-period`} className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Mês anterior: ${formatPeriod(shiftPeriod(target, -1))}`}
            onClick={() => choose(shiftPeriod(target, -1))}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 font-semibold"
            aria-expanded={picking}
            onClick={() => setPicking(!picking)}
          >
            <span className="first-letter:uppercase">{formatPeriod(target)}</span>
            <span className="sr-only">, escolher o mês</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Próximo mês: ${formatPeriod(shiftPeriod(target, 1))}`}
            onClick={() => choose(shiftPeriod(target, 1))}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        {picking && (
          <div className="rounded-lg border p-3">
            <PeriodPicker period={target} onSelect={choose} onPick={() => setPicking(false)} />
          </div>
        )}
      </div>
      <FormField
        id={`${id}-due`}
        label="Vencimento"
        error={formState.errors.dueDate?.message}
        hint={
          dueTyped
            ? undefined
            : billOf
              ? `Sugerido pela fatura do ${billOf}.`
              : transaction.dueDate
                ? 'O mesmo dia, no novo mês.'
                : undefined
        }
      >
        <Input type="date" {...register('dueDate')} />
      </FormField>
      {shares.length > 0 && !same && (
        <p aria-live="polite" className="bg-accent rounded-md px-3 py-2 text-sm">
          {sharesText}
        </p>
      )}
      {same && (
        <p aria-live="polite" className="text-muted-foreground text-sm">
          Já está em {formatPeriod(transaction.period)}. Escolha outro mês.
        </p>
      )}
      {update.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(update.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={same || update.isPending}>
          {update.isPending
            ? 'Salvando…'
            : `Mover para ${targetMonthText(transaction.period, target)}`}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
