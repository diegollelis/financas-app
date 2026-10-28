import {
  formatCents,
  formatIsoDate,
  formatPeriod,
  occurredOnRowLabels,
  todayIso,
  type Card,
  type CardBill,
  type Transaction,
} from '@financas/shared';
import { useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { QueryState } from '@/components/query-state';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCategories } from '@/features/categories/use-categories';
import { useMerchants } from '@/features/merchants/use-merchants';
import { dayInPeriod } from '@/features/transactions/row-format';
import { DIVIDED_LIST } from '@/features/view-mode/row-styles';
import { apiErrorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import { cardsFor } from './card-rules';
import { useCardBills, usePayBill, useUndoBill } from './use-cards';

const lancamentos = (count: number) => (count === 1 ? '1 lançamento' : `${count} lançamentos`);

/** Days from one ISO date to another, whole days. */
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** What a bill's due date says: overdue for how long, and its month when all share one. */
function billHint(bill: CardBill, today: string) {
  const periods = new Set(bill.transactions.map((transaction) => transaction.period));
  const month = periods.size === 1 ? `Fatura de ${formatPeriod([...periods][0]!)}.` : '';
  if (bill.dueDate >= today) return { text: month, overdue: false };
  const days = daysBetween(bill.dueDate, today);
  return {
    text: `Vencida há ${days === 1 ? '1 dia' : `${days} dias`}.${month ? ` ${month}` : ''}`,
    overdue: true,
  };
}

/**
 * What a line of the bill says under its description, as a row of Lançamentos does: the category,
 * the merchant, the day it happened and the installment. The method and the card are the bill's.
 */
function detailsOf(
  transaction: Transaction,
  categories: readonly { id: string; name: string }[],
  merchants: readonly { id: string; name: string }[],
) {
  return [
    categories.find((item) => item.id === transaction.categoryId)?.name,
    transaction.merchantId && merchants.find((item) => item.id === transaction.merchantId)?.name,
    transaction.occurredOn &&
      `${occurredOnRowLabels[transaction.type]} ${dayInPeriod(transaction.occurredOn, transaction.period)}`,
    transaction.installment &&
      `Parcela ${transaction.installment.number}/${transaction.installment.count}`,
  ].filter((part): part is string => Boolean(part));
}

/** A Select inside `FormField`, which passes the id and the error's aria props. */
function FieldSelect({
  value,
  onChange,
  options,
  placeholder,
  id,
  'aria-describedby': describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  id?: string;
  'aria-describedby'?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-describedby={describedBy} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * "Pagar fatura" (ADR 0062): a card's bill, the card plus a due date, settled at once on the day
 * of the payment, purchases and refunds; the toast's "Desfazer" takes back what it settled.
 * Opened from Lançamentos, where the card is chosen, and from Cartões, where it is `fixedCardId`.
 */
export function PayBillDialog({
  workspaceId,
  cards,
  fixedCardId,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  cards: readonly Card[];
  fixedCardId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: HTMLElement | null | RefObject<HTMLElement | null>;
}) {
  const bills = useCardBills(workspaceId, open);
  // Only to name each line as Lançamentos does: the dialog does not wait for them.
  const categories = useCategories(workspaceId).data ?? [];
  const merchants = useMerchants(workspaceId).data ?? [];
  const pay = usePayBill(workspaceId);
  const undo = useUndoBill(workspaceId);
  const today = todayIso();
  const creditCards = cardsFor(cards, 'CREDIT');
  const withBills = creditCards.filter((card) =>
    bills.data?.some((bill) => bill.cardId === card.id),
  );
  const [pickedCard, setPickedCard] = useState('');
  const cardId =
    fixedCardId ??
    (pickedCard ||
      (withBills.length === 1
        ? withBills[0]!.id
        : creditCards.length === 1
          ? creditCards[0]!.id
          : ''));
  const card = cards.find((item) => item.id === cardId);
  const cardBills = (bills.data ?? []).filter((bill) => bill.cardId === cardId);
  const [pickedDue, setPickedDue] = useState('');
  const bill = cardBills.find((item) => item.dueDate === pickedDue) ?? cardBills[0];
  const [settledAt, setSettledAt] = useState(today);
  const badDay = !settledAt || settledAt > today;
  const debits = bill?.transactions.filter((transaction) => transaction.type === 'DEBIT') ?? [];
  const credits = bill?.transactions.filter((transaction) => transaction.type === 'CREDIT') ?? [];
  // The purchases first, then the refunds, each as the bill has them.
  const lines = [...debits, ...credits];
  const sum = (items: Transaction[]) => items.reduce((total, item) => total + item.amountCents, 0);
  const hint = bill ? billHint(bill, today) : null;

  const confirm = () => {
    if (!bill || !card || badDay) return;
    pay.mutate(
      { cardId: card.id, dueDate: bill.dueDate, settledAt },
      {
        onSuccess: ({ transactionIds }) => {
          onOpenChange(false);
          toast.success(`Fatura do ${card.name} paga: ${lancamentos(transactionIds.length)}`, {
            // Paid in one tap, so undone in one too: back to pending, what this payment settled.
            action: {
              label: 'Desfazer',
              // mutateAsync: the dialog is closed by then, and mutate's callbacks of an unmounted
              // component never run.
              onClick: () =>
                void undo.mutateAsync({ cardId: card.id, transactionIds, settledAt }).then(
                  () => toast.success(`Fatura do ${card.name} de volta a pagar`),
                  (error: unknown) => toast.error(apiErrorMessage(error)),
                ),
            },
          });
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title="Pagar fatura"
      description={
        fixedCardId && card
          ? `${card.name}. Quita de uma vez os lançamentos pendentes da fatura, no dia do pagamento.`
          : 'Quita de uma vez os lançamentos pendentes da fatura, no dia do pagamento.'
      }
    >
      <div className="grid gap-4">
        <QueryState queries={[bills]} />
        {bills.isSuccess && (
          <>
            <div className="grid items-start gap-4 md:grid-cols-2">
              {!fixedCardId && (
                <FormField id="pay-bill-card" label="Cartão">
                  <FieldSelect
                    value={cardId}
                    onChange={(next) => {
                      setPickedCard(next);
                      setPickedDue('');
                    }}
                    options={creditCards.map((item) => ({ value: item.id, label: item.name }))}
                    placeholder="Escolha o cartão"
                  />
                </FormField>
              )}
              {bill && (
                <div className="grid gap-1">
                  <FormField id="pay-bill-due" label="Fatura">
                    <FieldSelect
                      value={bill.dueDate}
                      onChange={setPickedDue}
                      options={cardBills.map((item) => ({
                        value: item.dueDate,
                        label: `Vence em ${formatIsoDate(item.dueDate)}`,
                      }))}
                      placeholder="Escolha a fatura"
                    />
                  </FormField>
                  {hint?.text && (
                    <p
                      className={cn(
                        'text-sm',
                        hint.overdue ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {hint.text}
                    </p>
                  )}
                </div>
              )}
            </div>
            {card && !bill && (
              <div className="grid gap-1 rounded-xl border border-dashed p-4">
                <p>Nenhuma fatura pendente deste cartão.</p>
                <p className="text-muted-foreground text-sm">
                  As compras no Crédito com este cartão aparecem aqui até serem pagas.
                </p>
              </div>
            )}
            {bill && (
              <>
                <section aria-labelledby="pay-bill-items" className="grid gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 id="pay-bill-items" className="font-medium">
                      Lançamentos
                    </h3>
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {bill.transactions.length} a pagar
                    </p>
                  </div>
                  <ul className={DIVIDED_LIST}>
                    {lines.map((transaction) => (
                      <li
                        key={transaction.id}
                        className="flex items-start justify-between gap-3 py-2.5"
                      >
                        <span className="grid min-w-0">
                          <span className="break-words">{transaction.description}</span>
                          <span className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
                            {detailsOf(transaction, categories, merchants).map((part) => (
                              <span key={part}>{part}</span>
                            ))}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'font-medium whitespace-nowrap tabular-nums',
                            transaction.type === 'CREDIT' && 'text-credit-foreground',
                          )}
                        >
                          {transaction.type === 'CREDIT' ? '+ ' : '− '}
                          {formatCents(transaction.amountCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
                {/* One row per line, so the line above the total runs unbroken. */}
                <dl className="grid gap-1 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Compras</dt>
                    <dd className="tabular-nums">{formatCents(sum(debits))}</dd>
                  </div>
                  {credits.length > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Estornos</dt>
                      <dd className="tabular-nums">− {formatCents(sum(credits))}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 border-t pt-1.5 text-base font-semibold">
                    <dt>Total da fatura</dt>
                    <dd className="tabular-nums">{formatCents(bill.totalCents)}</dd>
                  </div>
                </dl>
                <div className="sm:max-w-56">
                  <FormField
                    id="pay-bill-settled-at"
                    label="Pago em"
                    error={
                      badDay
                        ? settledAt
                          ? 'O pagamento não pode ser numa data futura.'
                          : 'Informe o dia do pagamento.'
                        : undefined
                    }
                  >
                    <Input
                      type="date"
                      max={today}
                      value={settledAt}
                      onChange={(event) => setSettledAt(event.target.value)}
                    />
                  </FormField>
                </div>
              </>
            )}
            {Boolean(pay.error) && (
              <p role="alert" className="text-destructive">
                {apiErrorMessage(pay.error)}
              </p>
            )}
            <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
              {bill && (
                <Button type="button" disabled={pay.isPending || badDay} onClick={confirm}>
                  {pay.isPending
                    ? 'Pagando…'
                    : `Pagar ${formatCents(bill.totalCents)} (${lancamentos(bill.transactions.length)})`}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {bill ? 'Cancelar' : 'Fechar'}
              </Button>
            </div>
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
