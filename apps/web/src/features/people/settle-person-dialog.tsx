import {
  currentPeriod,
  formatCents,
  occurredOnRowLabels,
  todayIso,
  type PersonSettlementDraft,
  type Transaction,
} from '@financas/shared';
import { useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { useDialogDirty } from '@/components/dialog-dirty';
import { FormField } from '@/components/form-field';
import { QueryState } from '@/components/query-state';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { CategorySelect } from '@/features/categories/category-picker';
import { useCategories } from '@/features/categories/use-categories';
import { useMerchants } from '@/features/merchants/use-merchants';
import { dayInPeriod } from '@/features/transactions/row-format';
import { DIVIDED_LIST } from '@/features/view-mode/row-styles';
import { apiErrorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import { initiallyChosen, rewardOf, settlementSums, type RewardUnit } from './settlement';
import { useSettlePerson, useSettlementDraft, useUndoSettlement } from './use-people';

const lancamentos = (count: number) => (count === 1 ? '1 lançamento' : `${count} lançamentos`);

const unitOptions = [
  { value: 'PERCENT', label: '%' },
  { value: 'AMOUNT', label: 'R$' },
] as const;

type Named = readonly { id: string; name: string }[];

/** What a line says under its description: the category, the merchant, the day and the due date. */
function detailsOf(transaction: Transaction, categories: Named, merchants: Named) {
  return [
    categories.find((item) => item.id === transaction.categoryId)?.name,
    transaction.merchantId && merchants.find((item) => item.id === transaction.merchantId)?.name,
    transaction.occurredOn &&
      `${occurredOnRowLabels[transaction.type]} ${dayInPeriod(transaction.occurredOn, transaction.period)}`,
    transaction.dueDate && `Vence em ${dayInPeriod(transaction.dueDate, transaction.period)}`,
  ].filter((part): part is string => Boolean(part));
}

/**
 * "Pagar a Ana" (ADR 0065): what you owe a person settled at once on the day of the payment,
 * offsetting what they owe you when chosen, with the reward they gave back launched as a credit
 * received. Opened from Pessoas and from the ⋯ menu of a debit "A pagar para" in Lançamentos;
 * the toast's "Desfazer" takes it all back. Remount it (`key`) on each opening.
 */
export function SettlePersonDialog({
  workspaceId,
  person,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  person: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: HTMLElement | null | RefObject<HTMLElement | null>;
}) {
  const draft = useSettlementDraft(workspaceId, person.id, open);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={`Pagar a ${person.name}`}
      description="Quita de uma vez, no dia do pagamento, o que você deve a esta pessoa. A recompensa, se houver, entra como recebimento."
    >
      <div className="grid gap-4">
        <QueryState queries={[draft]} />
        {draft.isSuccess && (
          <SettleForm
            workspaceId={workspaceId}
            person={person}
            draft={draft.data}
            onDone={() => onOpenChange(false)}
          />
        )}
      </div>
    </ResponsiveDialog>
  );
}

function SettleForm({
  workspaceId,
  person,
  draft,
  onDone,
}: {
  workspaceId: string;
  person: { id: string; name: string };
  draft: PersonSettlementDraft;
  onDone: () => void;
}) {
  // Only to name each line as Lançamentos does, and to offer the reward's categories.
  const categories = useCategories(workspaceId).data ?? [];
  const merchants = useMerchants(workspaceId).data ?? [];
  const settle = useSettlePerson(workspaceId);
  const undo = useUndoSettlement(workspaceId);
  const today = todayIso();
  const [chosen, setChosen] = useState(() => new Set(initiallyChosen(draft, currentPeriod())));
  const [settledAt, setSettledAt] = useState(today);
  const [unit, setUnit] = useState<RewardUnit>('PERCENT');
  const [rewardText, setRewardText] = useState('');
  const [categoryId, setCategoryId] = useState(draft.rewardCategoryId ?? '');
  const [touched, setTouched] = useState(false);
  // Closing by mistake after choosing or typing something asks first.
  useDialogDirty(touched);

  const { debitCents } = settlementSums(draft, chosen, 0);
  const reward = rewardOf(rewardText, unit, debitCents);
  const { creditCents, transferCents } = settlementSums(draft, chosen, reward.cents);
  const count = [...draft.debits, ...draft.credits].filter((item) => chosen.has(item.id)).length;
  const creditOptions = categories.filter(
    (category) => category.type === 'CREDIT' && !category.archived,
  );
  const badDay = !settledAt || settledAt > today;
  const noDebit = debitCents === 0;
  const noCategory = reward.cents > 0 && categoryId === '';
  const blocked = badDay || noDebit || Boolean(reward.error) || noCategory;

  const toggle = (id: string, on: boolean) => {
    setTouched(true);
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const confirm = () => {
    if (blocked) return;
    settle.mutate(
      {
        personId: person.id,
        transactionIds: [...chosen],
        settledAt,
        ...(reward.cents > 0 && { reward: { amountCents: reward.cents, categoryId } }),
      },
      {
        onSuccess: (settlement) => {
          onDone();
          toast.success(
            `Acerto com ${person.name} registrado: ${lancamentos(settlement.transactionIds.length)}`,
            {
              action: {
                label: 'Desfazer',
                // mutateAsync: the dialog is closed by then, and mutate's callbacks of an
                // unmounted component never run.
                onClick: () =>
                  void undo.mutateAsync({ personId: person.id, settlementId: settlement.id }).then(
                    () => toast.success(`Acerto com ${person.name} desfeito`),
                    (error: unknown) => toast.error(apiErrorMessage(error)),
                  ),
              },
            },
          );
        },
      },
    );
  };

  if (draft.debits.length === 0) {
    return (
      <>
        <div className="grid gap-1 rounded-xl border border-dashed p-4">
          <p>Nada a pagar a {person.name}.</p>
          <p className="text-muted-foreground text-sm">
            As saídas com "A pagar para {person.name}" aparecem aqui até serem pagas.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onDone}>
          Fechar
        </Button>
      </>
    );
  }

  const lines = (items: Transaction[], idPrefix: string) => (
    <ul className={DIVIDED_LIST}>
      {items.map((transaction) => {
        const id = `${idPrefix}-${transaction.id}`;
        return (
          <li key={transaction.id} className="flex items-start gap-1 py-1 md:py-2">
            {/* A 44px target on the phone (ADR 0036), pulled left to line up with the text. */}
            <label
              htmlFor={id}
              className="-ml-3.5 flex size-11 shrink-0 cursor-pointer items-center justify-center md:-ml-1 md:size-6"
            >
              <Checkbox
                id={id}
                checked={chosen.has(transaction.id)}
                onCheckedChange={(checked) => toggle(transaction.id, checked === true)}
              />
            </label>
            <label htmlFor={id} className="grid min-w-0 flex-1 cursor-pointer pt-2.5 md:pt-0">
              <span className="break-words">{transaction.description}</span>
              <span className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
                {detailsOf(transaction, categories, merchants).map((part) => (
                  <span key={part}>{part}</span>
                ))}
              </span>
            </label>
            <span
              className={cn(
                'pt-2.5 font-medium whitespace-nowrap tabular-nums md:pt-0',
                transaction.type === 'CREDIT' && 'text-credit-foreground',
              )}
            >
              {transaction.type === 'CREDIT' ? '+ ' : '− '}
              {formatCents(transaction.amountCents)}
            </span>
          </li>
        );
      })}
    </ul>
  );

  const chosenDebits = draft.debits.filter((item) => chosen.has(item.id)).length;
  const rewardHint =
    reward.cents > 0 && unit === 'PERCENT'
      ? `${formatCents(reward.cents)} das compras marcadas.`
      : `O que ${person.name} devolve sobre as compras.`;

  return (
    <>
      <section aria-labelledby="settle-debits" className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="settle-debits" className="font-medium">
            Você deve
          </h3>
          <p className="text-muted-foreground text-sm tabular-nums">
            {chosenDebits} de {draft.debits.length}
          </p>
        </div>
        {lines(draft.debits, 'settle-debit')}
      </section>
      {draft.credits.length > 0 && (
        <section aria-labelledby="settle-credits" className="grid gap-2">
          <div className="grid gap-0.5">
            <h3 id="settle-credits" className="font-medium">
              Compensar o que {person.name} te deve
            </h3>
            <p className="text-muted-foreground text-sm">
              Marque para descontar da transferência e quitar junto.
            </p>
          </div>
          {lines(draft.credits, 'settle-credit')}
        </section>
      )}
      <div className="grid items-start gap-4 md:grid-cols-2">
        <FormField
          id="settle-settled-at"
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
            onChange={(event) => {
              setTouched(true);
              setSettledAt(event.target.value);
            }}
          />
        </FormField>
        <div className="grid gap-2">
          <FormField id="settle-reward" label="Recompensa (opcional)" error={reward.error}>
            <Input
              inputMode="decimal"
              autoComplete="off"
              placeholder={unit === 'PERCENT' ? '0' : '0,00'}
              value={rewardText}
              onChange={(event) => {
                setTouched(true);
                setRewardText(event.target.value);
              }}
            />
          </FormField>
          {/* How it is typed, beside what it comes to: under the field, so both line up. */}
          <div className="flex items-center gap-3">
            <SegmentedControl
              label="Recompensa em"
              className="w-28 shrink-0"
              options={unitOptions}
              value={unit}
              onChange={(next) => {
                setTouched(true);
                setUnit(next);
              }}
            />
            {!reward.error && (
              <p className="text-muted-foreground text-sm" aria-live="polite">
                {rewardHint}
              </p>
            )}
          </div>
        </div>
        {reward.cents > 0 && (
          <FormField
            id="settle-reward-category"
            label="Categoria da recompensa"
            error={noCategory ? 'Escolha a categoria da recompensa.' : undefined}
            hint={
              noCategory ? undefined : `Fica lembrada para o próximo acerto com ${person.name}.`
            }
          >
            <CategorySelect
              value={categoryId}
              onChange={(next) => {
                setTouched(true);
                setCategoryId(next);
              }}
              options={creditOptions}
            />
          </FormField>
        )}
      </div>
      {/* One row per line, so the line above the total runs unbroken. */}
      <dl className="grid gap-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Compras</dt>
          <dd className="tabular-nums">{formatCents(debitCents)}</dd>
        </div>
        {creditCents > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Compensado</dt>
            <dd className="tabular-nums">− {formatCents(creditCents)}</dd>
          </div>
        )}
        {reward.cents > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Recompensa</dt>
            <dd className="tabular-nums">− {formatCents(reward.cents)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t pt-1.5 text-base font-semibold">
          <dt>{transferCents >= 0 ? 'Você transfere' : `${person.name} te transfere`}</dt>
          <dd className="tabular-nums">{formatCents(Math.abs(transferCents))}</dd>
        </div>
      </dl>
      {noDebit && <p className="text-destructive text-sm">Marque pelo menos uma compra.</p>}
      {Boolean(settle.error) && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(settle.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="button" disabled={settle.isPending || blocked} onClick={confirm}>
          {settle.isPending
            ? 'Registrando…'
            : transferCents >= 0
              ? `Pagar ${formatCents(transferCents)} (${lancamentos(count)})`
              : `Receber ${formatCents(-transferCents)} de ${person.name} (${lancamentos(count)})`}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </>
  );
}
