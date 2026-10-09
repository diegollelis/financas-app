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
  level = 2,
  className,
  children,
}: {
  title: string;
  /** 3 for the blocks inside "Orçamento por destino". */
  level?: 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  const id = `dashboard-${title.toLowerCase().replace(/\W+/g, '-')}`;
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section aria-labelledby={id} className={cn('grid content-start gap-3', className)}>
      <Heading id={id} className="font-medium">
        {title}
      </Heading>
      {children}
    </section>
  );
}

/** Label left, value right, one per line. */
function AmountRows({ rows }: { rows: readonly (readonly [label: string, value: ReactNode])[] }) {
  return (
    <dl className="grid tabular-nums">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 border-b py-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
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

/** Part ÷ goal, as a percentage; nothing to compare with a goal of zero. */
function shareOfGoal(cents: number, goalCents: number) {
  if (goalCents <= 0) return '—';
  return formatBasisPoints(Math.round((cents / goalCents) * FULL_BASIS_POINTS));
}

/** Opens "Registrar aplicação" for a saving destination (ADR 0047); absent for a VIEWER. */
type OnApply = (destination: DestinationSummary, event: MouseEvent<HTMLButtonElement>) => void;

function ApplyButton({
  destination,
  onApply,
}: {
  destination: DestinationSummary;
  onApply?: OnApply;
}) {
  if (!onApply) return null;
  return (
    <Button variant="outline" size="sm" onClick={(event) => onApply(destination, event)}>
      {/* The visible word starts the accessible name, so voice control finds it. */}
      Aplicar <span className="sr-only">em {destination.name}</span>
    </Button>
  );
}

/**
 * Despesas, apart from the saving destinations (ADR 0047): its goal is a share of the net
 * income, and what counts is everything spent or still to pay, so "Usado da meta" matches the
 * meter.
 */
function ExpensesBlock({ summary }: { summary: Summary }) {
  const goal = summary.destinations.find((destination) => destination.kind === 'EXPENSES');
  if (!goal) return null;
  const { expenses } = summary;
  return (
    <Section title="Despesas" level={3}>
      <p className="text-muted-foreground">Quanto da renda líquida você planeja gastar no mês.</p>
      {goal.targetCents > 0 ? (
        <ExpensesMeter summary={summary} />
      ) : (
        <p className="text-muted-foreground">
          Sem meta: defina a renda líquida e o percentual de despesas no orçamento.
        </p>
      )}
      <AmountRows
        rows={[
          ['Pago', formatCents(expenses.settledCents)],
          ['A pagar', formatCents(expenses.pendingCents)],
          ['Usado da meta', shareOfGoal(expenses.totalCents, goal.targetCents)],
        ]}
      />
      <p className="text-muted-foreground text-sm">
        Usado da meta: o que já foi pago mais o que falta pagar.
      </p>
    </Section>
  );
}

/** The base of the saving goals, as a sum: where "Disponível para guardar" comes from. */
function AvailableBlock({ summary }: { summary: Summary }) {
  return (
    <Section title="O que sobra para guardar" level={3}>
      <p className="text-muted-foreground">
        Os créditos previstos menos as despesas previstas: é sobre esse valor que as metas de
        guardar são calculadas.
      </p>
      <AmountRows
        rows={[
          ['Créditos previstos', formatCents(summary.credits.totalCents)],
          ['Despesas previstas', `− ${formatCents(summary.expenses.totalCents)}`],
          [
            'Disponível para guardar',
            <span key="available" className="font-semibold">
              <SignedCents cents={summary.available.plannedCents} />
            </span>,
          ],
        ]}
      />
      <p className="text-muted-foreground text-sm">
        As aplicações não entram na conta: guardar mais não diminui as metas.
      </p>
    </Section>
  );
}

/** What is still to be launched for the goal: neither applied nor scheduled. */
const missingCents = (destination: DestinationSummary) =>
  Math.max(0, destination.targetCents - destination.appliedCents - destination.pendingCents);

/**
 * The saving destinations' amounts, in the order of the table's columns. "Agendado" is launched
 * and not paid yet; "Falta" is not launched at all ("A aplicar" was read as either).
 */
const savingCells = (destination: DestinationSummary) =>
  [
    ['Meta', formatCents(destination.targetCents)],
    ['Aplicado', formatCents(destination.appliedCents)],
    ['Agendado', formatCents(destination.pendingCents)],
    ['Falta', formatCents(missingCents(destination))],
  ] as const;

const realized = (destination: DestinationSummary) =>
  shareOfGoal(destination.appliedCents, destination.targetCents);

/** Each saving destination as a card on the phone: the table's columns do not fit in 360px. */
function SavingsCards({
  savings,
  summary,
  onApply,
}: {
  savings: DestinationSummary[];
  summary: Summary;
  onApply?: OnApply;
}) {
  return (
    <>
      <ul className="grid gap-3">
        {savings.map((destination) => (
          <li key={destination.destinationId} className="grid gap-2 rounded-xl border p-4">
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{destination.name}</span>
              <span className="text-muted-foreground">
                {formatBasisPoints(destination.basisPoints)}
              </span>
            </p>
            <dl className="grid grid-cols-2 gap-2 text-sm tabular-nums">
              {savingCells(destination).map(([label, value]) => (
                <div key={label} className="grid gap-0.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm tabular-nums">
              <span className="text-muted-foreground">Realizado:</span> {realized(destination)}
            </p>
            <div className="empty:hidden">
              <ApplyButton destination={destination} onApply={onApply} />
            </div>
          </li>
        ))}
      </ul>
      {summary.unallocated.basisPoints > 0 && (
        // Not a destination: a plain line, not a card.
        <AmountRows
          rows={[
            [
              `Sem destino (${formatBasisPoints(summary.unallocated.basisPoints)})`,
              formatCents(summary.unallocated.targetCents),
            ],
          ]}
        />
      )}
    </>
  );
}

/**
 * From md, where the columns fit. "Sem destino" closes the shares at 100%, so the total of the
 * goals is what is available.
 */
function SavingsTable({
  savings,
  summary,
  onApply,
}: {
  savings: DestinationSummary[];
  summary: Summary;
  onApply?: OnApply;
}) {
  const { unallocated } = summary;
  // What the goals are a share of: they and "Sem destino" add up to it, to the cent.
  const totalTarget = Math.max(0, summary.available.plannedCents);
  const totalApplied = summary.applied.settledCents;
  const actions = onApply ? <td className="py-2 pl-4" /> : null;
  return (
    <table className="w-full tabular-nums">
      <thead className="text-muted-foreground">
        <tr className="border-b">
          <th scope="col" className="py-2 text-left font-normal">
            Destino
          </th>
          {['%', 'Meta', 'Aplicado', 'Agendado', 'Falta', 'Realizado'].map((label) => (
            <th key={label} scope="col" className="py-2 text-right font-normal">
              {label}
            </th>
          ))}
          {onApply && (
            <th scope="col" className="py-2 pl-4 text-right font-normal">
              <span className="sr-only">Ações</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {savings.map((destination) => (
          <tr key={destination.destinationId} className="border-b">
            <th scope="row" className="py-2 text-left font-normal">
              {destination.name}
            </th>
            <td className="py-2 text-right">{formatBasisPoints(destination.basisPoints)}</td>
            {savingCells(destination).map(([label, value]) => (
              <td key={label} className="py-2 text-right">
                {value}
              </td>
            ))}
            <td className="py-2 text-right">{realized(destination)}</td>
            {onApply && (
              <td className="py-2 pl-4 text-right">
                <ApplyButton destination={destination} onApply={onApply} />
              </td>
            )}
          </tr>
        ))}
        {unallocated.basisPoints > 0 && (
          <tr className="text-muted-foreground border-b">
            <th scope="row" className="py-2 text-left font-normal">
              Sem destino
            </th>
            <td className="py-2 text-right">{formatBasisPoints(unallocated.basisPoints)}</td>
            <td className="py-2 text-right">{formatCents(unallocated.targetCents)}</td>
            <td colSpan={4} />
            {actions}
          </tr>
        )}
      </tbody>
      <tfoot className="font-medium">
        <tr>
          <th scope="row" className="py-2 text-left font-medium">
            Total
          </th>
          <td className="py-2 text-right">
            {formatBasisPoints(
              savings.reduce((sum, destination) => sum + destination.basisPoints, 0) +
                unallocated.basisPoints,
            )}
          </td>
          <td className="py-2 text-right">{formatCents(totalTarget)}</td>
          <td className="py-2 text-right">{formatCents(totalApplied)}</td>
          <td className="py-2 text-right">
            {formatCents(summary.applied.plannedCents - totalApplied)}
          </td>
          <td className="py-2 text-right">
            {formatCents(savings.reduce((sum, destination) => sum + missingCents(destination), 0))}
          </td>
          <td className="py-2 text-right">{shareOfGoal(totalApplied, totalTarget)}</td>
          {actions}
        </tr>
      </tfoot>
    </table>
  );
}

/** The saving destinations, each a share of what is left after expenses (ADR 0047). */
function SavingsBlock({
  summary,
  desktop,
  onApply,
}: {
  summary: Summary;
  desktop: boolean;
  onApply?: OnApply;
}) {
  const savings = summary.destinations.filter((destination) => destination.kind === 'SAVINGS');
  if (savings.length === 0) return null;
  return (
    <Section title="Destinos de guardar" level={3} className="xl:col-span-2">
      <p className="text-muted-foreground">
        Como você divide o que sobra entre os seus objetivos. A meta de cada um é uma parte do
        disponível para guardar, não da renda.
      </p>
      {summary.available.plannedCents <= 0 && (
        <p>Nada sobrou para guardar este mês: as despesas previstas alcançaram os créditos.</p>
      )}
      {desktop ? (
        <SavingsTable savings={savings} summary={summary} onApply={onApply} />
      ) : (
        <SavingsCards savings={savings} summary={summary} onApply={onApply} />
      )}
      <p className="text-muted-foreground text-sm">
        Aplicado: já lançado e pago. Agendado: lançado, ainda não pago. Falta: o que ainda não foi
        lançado. Realizado: quanto da meta já foi aplicado.
      </p>
    </Section>
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
          <div className="grid gap-1">
            <dl className="grid gap-1">
              <dt className="text-muted-foreground">Saldo previsto</dt>
              <dd className="text-4xl font-semibold tracking-tight sm:text-5xl">
                <SignedCents cents={summary.balance.plannedCents} />
              </dd>
            </dl>
            <p className="text-muted-foreground">
              Como o mês termina se tudo o que está previsto for recebido e pago.
            </p>
          </div>
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
        <p className="text-muted-foreground text-sm">
          Efetivado: só o que já foi recebido ou pago. Disponível para guardar: os créditos menos as
          despesas. Aplicado: o que já foi para os destinos de guardar.
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
        {/* Two bases (ADR 0047): Despesas on the income, then what is left, split among the
            saving destinations. Side by side from xl, the destinations across. */}
        <div className="grid gap-6 xl:grid-cols-2 xl:gap-x-10">
          <ExpensesBlock summary={summary} />
          <AvailableBlock summary={summary} />
          <SavingsBlock summary={summary} desktop={desktop} onApply={onApply} />
        </div>
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
    // The overdue notice opens them already filtered.
    transactions: `/espacos/${workspace.id}/lancamentos?competencia=${period}&situacao=vencidos`,
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
