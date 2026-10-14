import { formatPeriod, type Transaction } from '@financas/shared';
import { useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/error-message';
import { useRepeatTransaction } from './use-recurrences';

const amountKindOptions = [
  { value: 'FIXED', label: 'Fixo' },
  { value: 'VARIABLE', label: 'Variável' },
] as const;

/**
 * "Tornar recorrente" (ADR 0038): what will repeat, said before it does. The transaction becomes
 * the first month and keeps its amount; the next months appear as each one is opened. Mounted on
 * each opening, so it starts as "Fixo" and without errors.
 */
function RepeatForm({
  workspaceId,
  transaction,
  onDone,
}: {
  workspaceId: string;
  transaction: Transaction;
  onDone: () => void;
}) {
  const repeat = useRepeatTransaction(workspaceId);
  const [amountKind, setAmountKind] = useState<'FIXED' | 'VARIABLE'>('FIXED');
  const dueDay = transaction.dueDate ? Number(transaction.dueDate.slice(8)) : null;
  const submit = () =>
    repeat.mutate(
      { transactionId: transaction.id, variableAmount: amountKind === 'VARIABLE' },
      {
        onSuccess: () => {
          toast.success('Agora se repete todo mês');
          onDone();
        },
      },
    );

  return (
    <div className="grid gap-4">
      <p>
        Todo mês a partir de {formatPeriod(transaction.period)}
        {dueDay === null ? ', sem vencimento.' : `, vencendo no dia ${dueDay}.`} Este lançamento
        vira o primeiro mês; os próximos aparecem pendentes ao abrir cada mês.
      </p>
      <div className="grid gap-2">
        <p aria-hidden className="text-sm font-medium">
          Valor
        </p>
        <SegmentedControl
          label="Valor"
          options={amountKindOptions}
          value={amountKind}
          onChange={setAmountKind}
        />
        <p className="text-muted-foreground text-sm">
          {amountKind === 'VARIABLE'
            ? 'Para contas que mudam todo mês, como energia e água. Cada mês começa com a média dos 3 últimos pagos; ao marcar como pago, você informa o valor da fatura.'
            : 'O mesmo valor todo mês, como internet e aluguel.'}
        </p>
      </div>
      {repeat.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(repeat.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button onClick={submit} disabled={repeat.isPending}>
          {repeat.isPending ? 'Salvando…' : 'Tornar recorrente'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function RepeatDialog({
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
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={`Tornar ${transaction.description} recorrente`}
      description="Repete este lançamento todo mês, com a mesma categoria, valor e vencimento."
    >
      <RepeatForm
        workspaceId={workspaceId}
        transaction={transaction}
        onDone={() => onOpenChange(false)}
      />
    </ResponsiveDialog>
  );
}
