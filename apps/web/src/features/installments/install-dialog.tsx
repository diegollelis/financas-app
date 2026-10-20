import { formatCents, type Transaction } from '@financas/shared';
import { useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/error-message';
import { firstNumberOf, installmentsPreview } from './preview';
import { useInstallTransaction } from './use-installments';

const amountIsOptions = [
  { value: 'INSTALLMENT', label: 'Da parcela' },
  { value: 'TOTAL', label: 'Total' },
] as const;

const amountText = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });

/**
 * "Tornar parcelado" (ADR 0038 note): how many installments, which one this transaction is, and
 * whether its amount is an installment's or the whole purchase's, with the preview before it is
 * done. Mounted on each opening, so it starts empty and without errors.
 */
function InstallForm({
  workspaceId,
  transaction,
  onDone,
}: {
  workspaceId: string;
  transaction: Transaction;
  onDone: () => void;
}) {
  const install = useInstallTransaction(workspaceId);
  const [count, setCount] = useState('');
  const [first, setFirst] = useState('');
  // A settled one keeps its amount: only as an installment's.
  const settled = Boolean(transaction.settledAt);
  const [amountIs, setAmountIs] = useState<'INSTALLMENT' | 'TOTAL'>('INSTALLMENT');
  const [tried, setTried] = useState(false);
  const installments = Number(count);
  const firstNumber = firstNumberOf(first);
  const countError =
    !Number.isInteger(installments) || installments < 2 || installments > 120
      ? 'Informe de 2 a 120 parcelas.'
      : null;
  const firstError =
    countError === null &&
    (!Number.isInteger(firstNumber) || firstNumber < 1 || firstNumber >= installments)
      ? `Use um número de 1 a ${installments - 1}: na última parcela não há outras para criar.`
      : null;
  const preview =
    countError || firstError
      ? null
      : installmentsPreview(
          amountText.format(transaction.amountCents / 100),
          count,
          first,
          amountIs,
        );
  const submit = () => {
    setTried(true);
    if (countError || firstError) return;
    install.mutate(
      {
        transactionId: transaction.id,
        installments,
        ...(firstNumber > 1 && { firstNumber }),
        amountIs,
      },
      {
        onSuccess: () => {
          toast.success(`Agora é a parcela ${firstNumber}/${installments}`);
          onDone();
        },
      },
    );
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        <FormField
          id={`install-${transaction.id}-count`}
          label="Parcelas"
          error={tried ? (countError ?? undefined) : undefined}
        >
          <Input
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ex.: 10"
            className="tabular-nums"
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </FormField>
        <FormField
          id={`install-${transaction.id}-first`}
          label="Este lançamento é a parcela (opcional)"
          error={tried ? (firstError ?? undefined) : undefined}
        >
          <Input
            inputMode="numeric"
            autoComplete="off"
            placeholder="1"
            className="tabular-nums"
            value={first}
            onChange={(event) => setFirst(event.target.value)}
          />
        </FormField>
      </div>
      {settled ? (
        <p className="text-muted-foreground text-sm">
          Já pago: os {formatCents(transaction.amountCents)} ficam como o valor de cada parcela.
        </p>
      ) : (
        <div className="grid gap-2">
          <p aria-hidden className="text-sm font-medium">
            {formatCents(transaction.amountCents)} é o valor
          </p>
          <SegmentedControl
            label={`${formatCents(transaction.amountCents)} é o valor`}
            options={amountIsOptions}
            value={amountIs}
            onChange={setAmountIs}
          />
        </div>
      )}
      <p role="status">
        {preview
          ? `${preview} Este lançamento vira a ${firstNumber}/${installments}; as próximas aparecem pendentes nos meses seguintes, com a mesma categoria e vencimento.`
          : 'Informe as parcelas para ver como fica.'}
      </p>
      {install.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(install.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button onClick={submit} disabled={install.isPending}>
          {install.isPending ? 'Salvando…' : 'Tornar parcelado'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function InstallDialog({
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
      title={`Tornar ${transaction.description} parcelado`}
      description="Este lançamento vira uma das parcelas, e as próximas são criadas nos meses seguintes."
    >
      <InstallForm
        workspaceId={workspaceId}
        transaction={transaction}
        onDone={() => onOpenChange(false)}
      />
    </ResponsiveDialog>
  );
}
