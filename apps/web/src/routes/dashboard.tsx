import {
  formatBasisPoints,
  formatCents,
  formatPeriod,
  FULL_BASIS_POINTS,
  hasRole,
  type DestinationSummary,
  type Summary,
} from '@financas/shared';
import { TriangleAlert } from 'lucide-react';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PeriodNav } from '@/features/periods/period-nav';
import { usePeriod } from '@/features/periods/use-period';
import { CreditsBar } from '@/features/summary/credits-bar';
import { BudgetDialog } from '@/features/budget/budget-dialog';
import { useCategories } from '@/features/categories/use-categories';
import { usePeople } from '@/features/people/use-people';
import { TransactionDialog } from '@/features/transactions/transaction-dialog';
import type { TransactionPreset } from '@/features/transactions/transaction-form';
import { ExpensesMeter } from '@/features/summary/expenses-meter';
import { useSummary } from '@/features/summary/use-summary';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

/** Colored by sign, as in the spreadsheet; the minus sign keeps it readable without color. */
function SignedCents({ cents }: { cents: number }) {
  return <span className={cn(cents < 0 && 'text-destructive')}>{formatCents(cents)}</span>;
}

/**
 * A secondary indicator: a row (label left, value right) on the phone, a tile from sm. Values
 * use proportional figures: they stand alone, not in a column (dataviz skill).
 */
function StatTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0 sm:grid sm:justify-start sm:gap-1 sm:rounded-xl sm:border sm:p-4 sm:last:border-b">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{children}</dd>
    </div>
  );
}

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const id = `dashboard-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className={cn('grid content-start gap-3', className)}>
      <h2 id={id} className="font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Pending transactions past their due date, with an icon and words: never color alone. */
function OverdueNotice({
  summary,
  transactionsLink,
}: {
  summary: Summary;
  transactionsLink: string;
}) {
  const count = summary.credits.overdueCount + summary.debits.overdueCount;
  if (count === 0) return null;
  const cents = summary.credits.overdueCents + summary.debits.overdueCents;
  return (
    <div
      role="status"
      className="bg-warning-muted text-warning grid gap-2 rounded-xl p-4 sm:flex sm:items-center sm:justify-between"
    >
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlert aria-hidden className="size-5 shrink-0" />
        {count === 1 ? '1 lançamento vencido' : `${count} lançamentos vencidos`} (
        {formatCents(cents)}).
      </p>
      <Button asChild variant="outline" className="justify-self-start">
        <Link to={transactionsLink}>Ver lançamentos</Link>
      </Button>
    </div>
  );
}

function budgetOrigin(summary: Summary) {
  const { budget } = summary;
  if (budget.source === 'SAVED') return 'Orçamento próprio desta competência.';
  if (budget.source === 'INHERITED' && budget.inheritedFrom) {
    return `Orçamento herdado de ${formatPeriod(budget.inheritedFrom)}.`;
  }
  return 'Nenhum orçamento definido até aqui.';
}

/** Applied ÷ goal, as a percentage; nothing to compare with a goal of zero. */
function realized(destination: DestinationSummary) {
  if (destination.targetCents <= 0) return '—';
  return formatBasisPoints(
    Math.round((destination.appliedCents / destination.targetCents) * FULL_BASIS_POINTS),
  );
}

/** Opens "Registrar aplicação" for a saving destination (ADR 0047); absent for a VIEWER. */
type OnApply = (destination: DestinationSummary, event: MouseEvent<HTMLButtonElement>) => void;

/** The button of a saving destination: Despesas has no category to apply to. */
function ApplyButton({
  destination,
  onApply,
}: {
  destination: DestinationSummary;
  onApply?: OnApply;
}) {
  if (!onApply || destination.kind !== 'SAVINGS') return null;
  return (
    <Button variant="outline" size="sm" onClick={(event) => onApply(destination, event)}>
      {/* The visible word starts the accessible name, so voice control finds it. */}
      Aplicar <span className="sr-only">em {destination.name}</span>
    </Button>
  );
}

/** What each destination's numbers mean, under the table or the cards. */
const destinationsNote =
  'Despesas: meta sobre a renda líquida; aplicado é o que já foi gasto. Destinos de guardar: meta sobre o que sobra depois das despesas; aplicado é o que já foi lançado na categoria do destino.';

/** Each destination as a card on the phone: a six-column table does not fit in 360px. */
function DestinationCards({ summary, onApply }: { summary: Summary; onApply?: OnApply }) {
  return (
    <ul className="grid gap-3">
      {summary.destinations.map((destination) => (
        <li key={destination.destinationId} className="grid gap-2 rounded-xl border p-4">
          <p className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{destination.name}</span>
            <span className="text-muted-foreground">
              {formatBasisPoints(destination.basisPoints)}
            </span>
          </p>
          <dl className="grid grid-cols-2 gap-2 text-sm tabular-nums">
            {(
              [
                ['Meta', formatCents(destination.targetCents)],
                ['Aplicado', formatCents(destination.appliedCents)],
                ['A aplicar', formatCents(destination.pendingCents)],
                ['Realizado', realized(destination)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="grid gap-0.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="empty:hidden">
            <ApplyButton destination={destination} onApply={onApply} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** From md, where the columns fit: the same numbers, compared down each column. */
function DestinationTable({ summary, onApply }: { summary: Summary; onApply?: OnApply }) {
  return (
    <table className="w-full tabular-nums">
      <thead className="text-muted-foreground">
        <tr className="border-b">
          <th scope="col" className="py-2 text-left font-normal">
            Destino
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            %
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            Meta
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            Aplicado
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            A aplicar
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            Realizado
          </th>
          {onApply && (
            <th scope="col" className="py-2 pl-4 text-right font-normal">
              <span className="sr-only">Ações</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {summary.destinations.map((destination) => (
          <tr key={destination.destinationId} className="border-b last:border-b-0">
            <th scope="row" className="py-2 text-left font-normal">
              {destination.name}
            </th>
            <td className="py-2 text-right">{formatBasisPoints(destination.basisPoints)}</td>
            <td className="py-2 text-right">{formatCents(destination.targetCents)}</td>
            <td className="py-2 text-right">{formatCents(destination.appliedCents)}</td>
            <td className="py-2 text-right">{formatCents(destination.pendingCents)}</td>
            <td className="py-2 text-right">{realized(destination)}</td>
            {onApply && (
              <td className="py-2 pl-4 text-right">
                <ApplyButton destination={destination} onApply={onApply} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type PageLinks = { transactions: string };

/**
 * The month on one screen (ADRs 0031, 0045, 0046). One column up to xl; from there, two: the
 * balance across the top, credits and debits beside where the credits go, and the budget (with
 * the expenses goal) across the bottom, so a wide screen is used without stretching any row.
 */
function Dashboard({
  summary,
  links,
  onEditBudget,
  onApply,
}: {
  summary: Summary;
  links: PageLinks;
  /** Opens the budget dialog; absent for a VIEWER, who cannot change it. */
  onEditBudget?: (event: MouseEvent<HTMLButtonElement>) => void;
  onApply?: OnApply;
}) {
  const { credits, debits } = summary;
  const desktop = useMediaQuery(DESKTOP_QUERY);
  return (
    <div className="grid gap-6 xl:grid-cols-2 xl:gap-x-10 xl:gap-y-8">
      <div className="empty:hidden xl:col-span-2">
        <OverdueNotice summary={summary} transactionsLink={links.transactions} />
      </div>
      <Section title="Saldo do mês" className="xl:col-span-2">
        {/* Planned: as if everything were settled. Settled: only what happened (ADR 0031). */}
        <div className="grid gap-4">
          {/* The one number the month leads with (dataviz skill: one hero per view). */}
          <dl className="grid gap-1">
            <dt className="text-muted-foreground">Saldo previsto</dt>
            <dd className="text-4xl font-semibold tracking-tight sm:text-5xl">
              <SignedCents cents={summary.balance.plannedCents} />
            </dd>
          </dl>
          <dl className="grid sm:grid-cols-3 sm:gap-3">
            <StatTile label="Saldo efetivado">
              <SignedCents cents={summary.balance.settledCents} />
            </StatTile>
            <StatTile label="Disponível para guardar">
              <SignedCents cents={summary.available.plannedCents} />
            </StatTile>
            <StatTile label="Aplicado">
              <SignedCents cents={summary.applied.settledCents} />
            </StatTile>
          </dl>
        </div>
        {summary.estimatedCents > 0 && (
          // The planned view counts estimates of variable bills (ADR 0038): say how much.
          <p>
            Inclui {formatCents(summary.estimatedCents)} em valores estimados, de contas que variam.
          </p>
        )}
        <p className="text-muted-foreground">
          Previsto: como se tudo fosse efetivado. Efetivado: só o que já foi recebido ou pago.
          Disponível para guardar: os créditos menos as despesas. Aplicado: o que já foi para os
          destinos de guardar.
        </p>
      </Section>
      <Section title="Créditos e débitos">
        <dl className="grid tabular-nums sm:grid-cols-2 sm:gap-x-8">
          {(
            [
              ['Recebidos', credits.settledCents],
              ['A receber', credits.pendingCents],
              ['Pagos', debits.settledCents],
              ['A pagar', debits.pendingCents],
            ] as const
          ).map(([label, cents]) => (
            <div key={label} className="flex justify-between gap-3 border-b py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{formatCents(cents)}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="Para onde vão os créditos">
        <CreditsBar summary={summary} />
      </Section>
      <Section title="Orçamento por destino" className="xl:col-span-2">
        <div className="grid justify-items-start gap-2">
          {/* The net income the goals are a share of: shown here now that the budget has no
              page of its own (ADR 0046). */}
          <p>
            Renda líquida:{' '}
            <span className="font-medium tabular-nums">
              {summary.budget.netIncomeCents > 0
                ? formatCents(summary.budget.netIncomeCents)
                : 'não definida'}
            </span>
          </p>
          <p className="text-muted-foreground">{budgetOrigin(summary)}</p>
          {onEditBudget &&
            // Highlighted until the workspace has a budget (ADR 0047), plain after.
            (summary.budget.source === 'NONE' ? (
              <Button onClick={onEditBudget}>Definir orçamento</Button>
            ) : (
              <Button variant="outline" onClick={onEditBudget}>
                Editar orçamento
              </Button>
            ))}
        </div>
        {/* The expenses goal, drawn: the one destination with a limit to watch. */}
        <ExpensesMeter summary={summary} />
        {desktop ? (
          <DestinationTable summary={summary} onApply={onApply} />
        ) : (
          <DestinationCards summary={summary} onApply={onApply} />
        )}
        <p className="text-muted-foreground">{destinationsNote}</p>
      </Section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid gap-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-12 w-56" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-12 sm:h-20" />
        ))}
      </div>
      <Skeleton className="h-24" />
      <Skeleton className="h-40" />
    </>
  );
}

/**
 * "Registrar aplicação" (ADR 0047): a new debit in the destination's category, for what is
 * still missing to reach its goal (paid and scheduled applications discounted). It loads the
 * categories and people the form needs only when opened.
 */
function ApplyDialog({
  workspaceId,
  period,
  preset,
  returnFocusTo,
  onClose,
}: {
  workspaceId: string;
  period: string;
  preset: TransactionPreset;
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
}) {
  const categories = useCategories(workspaceId);
  const people = usePeople(workspaceId);
  if (!categories.isSuccess || !people.isSuccess) return null;
  return (
    <TransactionDialog
      workspaceId={workspaceId}
      period={period}
      categories={categories.data}
      people={people.data}
      editing={null}
      preset={preset}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      returnFocusTo={returnFocusTo}
    />
  );
}

/** The new transaction an application starts from. */
function applicationPreset(summary: Summary, destination: DestinationSummary): TransactionPreset {
  const categoryId =
    summary.budget.shares.find((share) => share.destinationId === destination.destinationId)
      ?.categoryId ?? '';
  const missing = destination.targetCents - destination.appliedCents - destination.pendingCents;
  return {
    type: 'DEBIT',
    categoryId,
    description: `Aplicação em ${destination.name}`,
    amountCents: missing > 0 ? missing : null,
    // Without its category the form cannot fix it: then it is chosen as in any transaction.
    applicationTo: categoryId ? destination.name : undefined,
  };
}

export function DashboardPage() {
  const workspace = useCurrentWorkspace();
  const period = usePeriod();
  const summary = useSummary(workspace.id, period);
  // The other page of the same competência.
  const links: PageLinks = {
    transactions: `/espacos/${workspace.id}/lancamentos?competencia=${period}`,
  };
  // The budget is edited here, in a dialog (ADR 0046); focus goes back to whichever button
  // opened it ("Definir orçamento" or "Editar orçamento").
  const [budgetOpener, setBudgetOpener] = useState<HTMLElement | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const editBudget = canEdit
    ? (event: MouseEvent<HTMLButtonElement>) => {
        setBudgetOpener(event.currentTarget);
        setBudgetOpen(true);
      }
    : undefined;
  const [application, setApplication] = useState<{
    preset: TransactionPreset;
    opener: HTMLElement;
  } | null>(null);
  const apply: OnApply | undefined =
    canEdit && summary.isSuccess
      ? (destination, event) =>
          setApplication({
            preset: applicationPreset(summary.data, destination),
            opener: event.currentTarget,
          })
      : undefined;

  return (
    <>
      <PageHeader title="Painel">
        <PeriodNav period={period} />
      </PageHeader>
      <QueryState queries={[summary]} skeleton={<DashboardSkeleton />} />
      {summary.isSuccess && (
        <Dashboard summary={summary.data} links={links} onEditBudget={editBudget} onApply={apply} />
      )}
      {editBudget && (
        <BudgetDialog
          workspaceId={workspace.id}
          period={period}
          open={budgetOpen}
          onOpenChange={setBudgetOpen}
          returnFocusTo={budgetOpener}
        />
      )}
      {application && (
        <ApplyDialog
          workspaceId={workspace.id}
          period={period}
          preset={application.preset}
          returnFocusTo={application.opener}
          onClose={() => setApplication(null)}
        />
      )}
    </>
  );
}
