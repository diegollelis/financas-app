import {
  formatCents,
  formatIsoDate,
  hasRole,
  todayIso,
  transactionStatus,
  type Category,
  type Transaction,
  type TransactionStatus,
  type TransactionType,
} from '@financas/shared';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/features/categories/use-categories';
import { PeriodNav } from '@/features/periods/period-nav';
import { usePeriod } from '@/features/periods/use-period';
import {
  TransactionForm,
  type TransactionFormValues,
} from '@/features/transactions/transaction-form';
import {
  useCreateTransaction,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from '@/features/transactions/use-transactions';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { apiErrorMessage } from '@/lib/error-message';

const sections: { type: TransactionType; title: string }[] = [
  { type: 'CREDIT', title: 'Créditos' },
  { type: 'DEBIT', title: 'Débitos' },
];

/** Colors as in the spreadsheet: red while pending past the due date, green once settled. */
function StatusBadge({ transaction, today }: { transaction: Transaction; today: string }) {
  const status: TransactionStatus = transactionStatus(transaction, today);
  if (status === 'SETTLED') {
    return (
      <Badge variant="success">Efetivado em {formatIsoDate(transaction.settledAt ?? '')}</Badge>
    );
  }
  if (status === 'OVERDUE') return <Badge variant="destructive">Vencido</Badge>;
  return <Badge variant="outline">Pendente</Badge>;
}

function TransactionItem({
  workspaceId,
  transaction,
  categories,
  canEdit,
  today,
}: {
  workspaceId: string;
  transaction: Transaction;
  categories: Category[];
  canEdit: boolean;
  today: string;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view');
  const update = useUpdateTransaction(workspaceId);
  const remove = useDeleteTransaction(workspaceId);
  const category = categories.find((item) => item.id === transaction.categoryId);
  const { description } = transaction;

  if (mode === 'edit') {
    return (
      <li className="rounded-md border p-3">
        <TransactionForm
          idPrefix={transaction.id}
          categories={categories}
          initial={transaction}
          submitLabel="Salvar"
          pending={update.isPending}
          error={update.error}
          onSubmit={(values) =>
            update.mutate(
              {
                id: transaction.id,
                type: values.type,
                description: values.description,
                notes: values.notes ?? null,
                categoryId: values.categoryId,
                amountCents: values.amount,
                dueDate: values.dueDate,
              },
              { onSuccess: () => setMode('view') },
            )
          }
          onCancel={() => setMode('view')}
        />
      </li>
    );
  }
  return (
    <li className="grid gap-1 border-b py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{description}</p>
          <p className="text-muted-foreground text-xs">
            {category?.name ?? 'Categoria'}
            {transaction.dueDate && ` · vence ${formatIsoDate(transaction.dueDate)}`}
          </p>
          {transaction.notes && (
            <p className="text-muted-foreground text-xs">{transaction.notes}</p>
          )}
        </div>
        <div className="grid shrink-0 justify-items-end gap-1">
          <span className="font-medium tabular-nums">{formatCents(transaction.amountCents)}</span>
          <StatusBadge transaction={transaction} today={today} />
        </div>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-1">
          {transaction.settledAt ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Desfazer efetivação de ${description}`}
              disabled={update.isPending}
              onClick={() => update.mutate({ id: transaction.id, settledAt: null })}
            >
              Desfazer
            </Button>
          ) : (
            // One click: settled today. The date can be fixed later by editing.
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Efetivar ${description}`}
              disabled={update.isPending}
              onClick={() => update.mutate({ id: transaction.id, settledAt: today })}
            >
              Efetivar
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Editar ${description}`}
            onClick={() => setMode('edit')}
          >
            Editar
          </Button>
          {mode === 'confirm-delete' ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                disabled={remove.isPending}
                onClick={() => remove.mutate(transaction.id)}
              >
                Confirmar exclusão
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMode('view')}>
                Manter
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Excluir ${description}`}
              onClick={() => setMode('confirm-delete')}
            >
              Excluir
            </Button>
          )}
        </div>
      )}
      {(update.error ?? remove.error) && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(update.error ?? remove.error)}
        </p>
      )}
    </li>
  );
}

function NewTransaction({
  workspaceId,
  period,
  categories,
}: {
  workspaceId: string;
  period: string;
  categories: Category[];
}) {
  const create = useCreateTransaction(workspaceId);
  // A new key remounts the form, empty, ready for the next transaction.
  const [formKey, setFormKey] = useState(0);
  const submit = (values: TransactionFormValues) =>
    create.mutate(
      {
        type: values.type,
        description: values.description,
        notes: values.notes ?? null,
        categoryId: values.categoryId,
        amountCents: values.amount,
        period,
        dueDate: values.dueDate,
      },
      {
        onSuccess: () => {
          create.reset();
          setFormKey((key) => key + 1);
        },
      },
    );

  return (
    <section aria-labelledby="new-transaction-title" className="grid gap-3">
      <h2 id="new-transaction-title" className="font-medium">
        Novo lançamento
      </h2>
      <TransactionForm
        key={formKey}
        idPrefix="new"
        categories={categories}
        submitLabel={create.isPending ? 'Lançando…' : 'Lançar'}
        pending={create.isPending}
        error={create.error}
        onSubmit={submit}
      />
    </section>
  );
}

export function TransactionsPage() {
  const workspace = useCurrentWorkspace();
  const workspaceId = workspace.id;
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const period = usePeriod();
  const today = todayIso();
  const categories = useCategories(workspaceId);
  const transactions = useTransactions(workspaceId, period);
  const ready = categories.isSuccess && transactions.isSuccess;

  return (
    <>
      <PageHeader title="Lançamentos">
        <PeriodNav period={period} />
      </PageHeader>
      <QueryState queries={[categories, transactions]} />
      {ready && (
        <>
          {sections.map(({ type, title }) => {
            const items = transactions.data.filter((item) => item.type === type);
            const total = items.reduce((sum, item) => sum + item.amountCents, 0);
            const titleId = `transactions-${type}`;
            return (
              <section key={type} aria-labelledby={titleId} className="grid gap-2">
                <div className="flex items-baseline justify-between">
                  <h2 id={titleId} className="font-medium">
                    {title}
                  </h2>
                  <span className="text-muted-foreground tabular-nums">
                    Total: {formatCents(total)}
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="text-muted-foreground">Nenhum lançamento.</p>
                ) : (
                  <ul>
                    {items.map((transaction) => (
                      <TransactionItem
                        key={transaction.id}
                        workspaceId={workspaceId}
                        transaction={transaction}
                        categories={categories.data}
                        canEdit={canEdit}
                        today={today}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {canEdit && (
            <NewTransaction
              // Another competência starts with an empty form and no error left over.
              key={period}
              workspaceId={workspaceId}
              period={period}
              categories={categories.data}
            />
          )}
        </>
      )}
    </>
  );
}
