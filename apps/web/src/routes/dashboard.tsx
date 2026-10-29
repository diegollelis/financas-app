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
import { InfoTip } from '@/components/info-tip';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { SectionCard as Card } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ClosingCard } from '@/features/periods/closing';
import { PeriodNav } from '@/features/periods/period-nav';
import { useIsClosed } from '@/features/periods/use-closing';
import { usePeriod } from '@/features/periods/use-period';
import { CreditsBar } from '@/features/summary/credits-bar';
import { BudgetDialog } from '@/features/budget/budget-dialog';
import { BudgetPlan } from '@/features/budget/budget-plan';
import { DestinationsDialog } from '@/features/budget/destination-manager';
import { STRIPED_ROW, TABLE_BOX } from '@/features/view-mode/row-styles';
import { SortableHead } from '@/features/view-mode/sortable-head';
import { sortRows, useSort, type SortValue } from '@/features/view-mode/sort';
import { useShowsTable } from '@/features/view-mode/view-mode';
import { ViewModeToggle } from '@/features/view-mode/view-mode-toggle';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCategories } from '@/features/categories/use-categories';
import { usePeople } from '@/features/people/use-people';
import { useCards } from '@/features/cards/use-cards';
import { TransactionDialog } from '@/features/transactions/transaction-dialog';
import type { TransactionPreset } from '@/features/transactions/transaction-form';
import { ExpensesMeter } from '@/features/summary/expenses-meter';
import { useSummary } from '@/features/summary/use-summary';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { cn } from '@/lib/utils';

/** Colored by sign, as in the spreadsheet; the minus sign keeps it readable without color. */
function SignedCents({ cents }: { cents: number }) {
  return <span className={cn(cents < 0 && 'text-destructive')}>{formatCents(cents)}</span>;
}

/**
 * A labelled amount, with optional lines under it ("R$ 5.200,00 recebidos"): one per fact, each
 * starting with its amount, never two facts joined in one line.
 */
function Figure({
  label,
  help,
  sub,
  children,
}: {
  label: string;
  help?: ReactNode;
  sub?: string | (string | null)[];
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <dt className="text-muted-foreground flex items-center text-sm">
        {label}
        {help && <InfoTip term={label}>{help}</InfoTip>}
      </dt>
      <dd className="text-lg font-semibold whitespace-nowrap tabular-nums">{children}</dd>
      {[sub ?? []].flat().map(
        (line) =>
          line && (
            <dd key={line} className="text-muted-foreground text-sm tabular-nums">
              {line}
            </dd>
          ),
      )}
    </div>
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
  if (budget.source === 'SAVED') return 'Orçamento próprio deste mês.';
  if (budget.source === 'INHERITED' && budget.inheritedFrom) {
    return `Orçamento herdado de ${formatPeriod(budget.inheritedFrom)}.`;
  }
  return 'Nenhum orçamento definido até aqui.';
}

/** Part ÷ goal, as a percentage; nothing to compare with a goal of zero. */
function shareOfGoal(cents: number, goalCents: number) {
  if (goalCents <= 0) return null;
  return formatBasisPoints(Math.round((cents / goalCents) * FULL_BASIS_POINTS));
}

/** Opens "Guardar em …" for a saving destination (ADRs 0047, 0051); absent for a VIEWER. */
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
      Guardar <span className="sr-only">em {destination.name}</span>
    </Button>
  );
}

/**
 * The month's balance, credits and debits in one card (ADR 0045 note): the planned balance leads,
 * then what comes in and goes out with what already happened, the bar of where the credits go and
 * the balance of what is settled.
 */
function BalanceCard({ summary }: { summary: Summary }) {
  const { credits, debits, balance } = summary;
  return (
    <Card title="Saldo do mês">
      {/* Planned: as if everything were settled. Settled: only what happened (ADR 0031). */}
      <div className="grid justify-items-start gap-2">
        {/* The one number the month leads with (dataviz skill: one hero per view). */}
        <dl className="grid gap-1">
          <dt className="text-muted-foreground flex items-center">
            Saldo previsto
            <InfoTip term="Saldo previsto">
              <p>Como o mês termina se tudo o que está previsto for recebido e pago.</p>
              <p>
                Fica de fora o que está a receber ou a pagar sem vencimento numa categoria que não
                conta como renda nem gasto, como um empréstimo sem prazo para voltar.
              </p>
            </InfoTip>
          </dt>
          <dd className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
            <SignedCents cents={balance.plannedCents} />
          </dd>
        </dl>
        {summary.estimatedCents > 0 && (
          // The planned view counts estimates of variable bills (ADR 0038): say how much.
          <p className="text-muted-foreground text-sm">
            Inclui {formatCents(summary.estimatedCents)} em valores estimados, de contas que variam.
          </p>
        )}
        {summary.undatedCents > 0 && (
          // Money lent coming back some day: nobody knows the month (ADR 0057).
          <p className="text-muted-foreground text-sm">
            Não inclui {formatCents(summary.undatedCents)} a receber sem vencimento.
          </p>
        )}
        {summary.undatedPayableCents > 0 && (
          // Money borrowed to pay back some day (ADR 0057 note).
          <p className="text-muted-foreground text-sm">
            Não inclui {formatCents(summary.undatedPayableCents)} a pagar sem vencimento.
          </p>
        )}
      </div>
      {/* What counts in the planned balance, so the two add up to it (ADR 0057 note): what has no
          due date is said under the balance. */}
      <dl className="grid grid-cols-2 gap-4">
        <Figure label="Entradas" sub={`${formatCents(credits.settledCents)} recebidos`}>
          {formatCents(credits.totalCents - summary.undatedCents)}
        </Figure>
        <Figure label="Saídas" sub={`${formatCents(debits.settledCents)} pagos`}>
          {formatCents(debits.totalCents - summary.undatedPayableCents)}
        </Figure>
      </dl>
      <CreditsBar summary={summary} />
      <dl className="flex items-center justify-between gap-3 border-t pt-3">
        <dt className="text-muted-foreground flex items-center">
          Saldo atual
          <InfoTip term="Saldo atual">
            <p>Só o que já foi recebido ou pago.</p>
          </InfoTip>
        </dt>
        <dd className="font-semibold tabular-nums">
          <SignedCents cents={balance.settledCents} />
        </dd>
      </dl>
    </Card>
  );
}

/**
 * The spending limit (Despesas, ADRs 0047 and 0051), apart from the saving goals: a share of the
 * net income, and what counts is everything spent or still to pay. Putting money aside is not
 * spending, so this differs from the debits of the balance card, and the "ⓘ" says why.
 */
function LimitCard({ summary }: { summary: Summary }) {
  const goal = summary.destinations.find((destination) => destination.kind === 'EXPENSES');
  if (!goal) return null;
  const { expenses } = summary;
  return (
    <Card
      title="Limite de gastos"
      help={
        <>
          <p>Quanto da renda líquida você planeja gastar no mês.</p>
          <p>
            Gastos: o que já foi pago mais o que falta pagar. Guardar nas metas não conta como
            gasto, nem as categorias marcadas "Nem renda nem gasto", como um empréstimo.
          </p>
        </>
      }
    >
      {goal.targetCents > 0 ? (
        <ExpensesMeter summary={summary} />
      ) : (
        <p className="text-muted-foreground">
          Sem limite: defina a renda líquida e o percentual do limite de gastos no orçamento.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-4">
        {/* "Gastos", not "Pago": the debits of the balance card count the goals too. */}
        <Figure label="Gastos pagos">{formatCents(expenses.settledCents)}</Figure>
        <Figure label="Gastos a pagar">{formatCents(expenses.pendingCents)}</Figure>
      </dl>
    </Card>
  );
}

/**
 * Under "Sobra prevista" (ADR 0064): how far the expenses passed the credits, how much the goals
 * still lack, or what is left beyond them.
 */
function leftoverNote(summary: Summary) {
  const leftover = summary.available.plannedCents;
  const goals = summary.destinations
    .filter((destination) => destination.kind === 'SAVINGS')
    .reduce((sum, destination) => sum + destination.targetCents, 0);
  if (leftover < 0) return `Os gastos passaram as entradas em ${formatCents(-leftover)}.`;
  if (goals === 0) return undefined;
  if (leftover < goals) return `Faltam ${formatCents(goals - leftover)} para cumprir as metas.`;
  return `Cobre as metas e ainda sobram ${formatCents(leftover - goals)}.`;
}

/** What is still to be launched for the goal: neither applied nor scheduled. */
const missingCents = (destination: DestinationSummary) =>
  Math.max(0, destination.targetCents - destination.appliedCents - destination.pendingCents);

/** Where a goal stands, in words: "R$ 500,00 pendente. Falta lançar R$ 782,00." */
function goalNote(destination: DestinationSummary) {
  if (destination.targetCents <= 0) return 'Sem valor este mês.';
  if (destination.appliedCents >= destination.targetCents) return 'Meta alcançada.';
  const missing = missingCents(destination);
  return [
    destination.pendingCents > 0 && `${formatCents(destination.pendingCents)} pendente.`,
    missing > 0 ? `Falta lançar ${formatCents(missing)}.` : 'Meta toda lançada.',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * How much of the goal is set aside: paid in the fill, pending (launched, not paid) striped after
 * it. A meter, with its amounts in words for a screen reader.
 */
function GoalProgress({ destination }: { destination: DestinationSummary }) {
  const target = destination.targetCents;
  const paid = Math.min(destination.appliedCents / target, 1) * 100;
  const pending = Math.min(destination.pendingCents / target, 1 - paid / 100) * 100;
  return (
    <div
      role="meter"
      aria-label={`Progresso de ${destination.name}`}
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={Math.min(destination.appliedCents, target)}
      aria-valuetext={`${formatCents(destination.appliedCents)} guardados de ${formatCents(target)}`}
      className="bg-chart-3/20 flex h-2 overflow-hidden rounded-full"
    >
      <div className="bg-chart-3 h-full" style={{ width: `${paid}%` }} />
      <div
        className="h-full bg-[repeating-linear-gradient(135deg,var(--chart-3)_0_4px,transparent_4px_7px)]"
        style={{ width: `${pending}%` }}
      />
    </div>
  );
}

/**
 * One goal: its name and "Guardar" on the first line, so the amounts, the progress and the note
 * below take the whole width and do not wrap at 360px.
 */
function GoalRow({ destination, onApply }: { destination: DestinationSummary; onApply?: OnApply }) {
  const progress = shareOfGoal(destination.appliedCents, destination.targetCents);
  return (
    <li className="grid content-start gap-1.5 border-t py-3 first:border-t-0 first:pt-0 @3xl:nth-2:border-t-0 @3xl:nth-2:pt-0">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <p className="font-medium">
          {destination.name}{' '}
          <span className="text-muted-foreground text-sm font-normal whitespace-nowrap">
            {formatBasisPoints(destination.basisPoints)} da renda
          </span>
        </p>
        <ApplyButton destination={destination} onApply={onApply} />
      </div>
      <p className="text-sm tabular-nums">
        <span className="font-semibold">{formatCents(destination.appliedCents)}</span>{' '}
        <span className="text-muted-foreground">
          de {formatCents(destination.targetCents)}
          {progress && ` (${progress})`}
        </span>
      </p>
      {destination.targetCents > 0 && <GoalProgress destination={destination} />}
      <p className="text-muted-foreground text-sm tabular-nums">{goalNote(destination)}</p>
    </li>
  );
}

type GoalSortKey = 'name' | 'share' | 'target' | 'applied' | 'pending' | 'missing';

const goalSortValues: Record<GoalSortKey, (destination: DestinationSummary) => SortValue> = {
  name: (destination) => destination.name,
  share: (destination) => destination.basisPoints,
  target: (destination) => destination.targetCents,
  applied: (destination) => destination.appliedCents,
  pending: (destination) => destination.pendingCents,
  missing: missingCents,
};

/**
 * The goals as a table, from xl ("Ver como: Tabela", ADR 0064): the same facts as the rows, one
 * column each, sorted by the column clicked.
 */
function GoalsTable({ goals, onApply }: { goals: DestinationSummary[]; onApply?: OnApply }) {
  const sort = useSort<GoalSortKey>('name');
  const rows =
    sort.key === 'name' && sort.direction === 'asc'
      ? goals
      : sortRows(goals, goalSortValues[sort.key], sort.direction);
  const head = (key: GoalSortKey, label: string, align: 'left' | 'right' = 'right') => (
    <SortableHead
      label={label}
      active={sort.key === key}
      direction={sort.direction}
      onSort={() => sort.toggle(key)}
      align={align}
    />
  );
  return (
    <div className={TABLE_BOX}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {head('name', 'Meta', 'left')}
            {head('share', '% da renda')}
            {head('target', 'Valor')}
            {head('applied', 'Guardado')}
            {head('pending', 'Pendente')}
            {head('missing', 'Falta lançar')}
            <TableHead>Progresso</TableHead>
            {onApply && (
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((destination) => (
            <TableRow key={destination.destinationId} className={STRIPED_ROW}>
              <TableCell className="font-medium whitespace-normal">{destination.name}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBasisPoints(destination.basisPoints)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCents(destination.targetCents)}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {formatCents(destination.appliedCents)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCents(destination.pendingCents)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCents(missingCents(destination))}
              </TableCell>
              <TableCell className="w-36">
                {destination.targetCents > 0 ? (
                  <GoalProgress destination={destination} />
                ) : (
                  <span className="text-muted-foreground">Sem valor</span>
                )}
              </TableCell>
              {onApply && (
                <TableCell className="text-right">
                  <ApplyButton destination={destination} onApply={onApply} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The goals, each a share of the net income (ADR 0064), under what was set aside of them and what
 * is left in the month. "Gerenciar metas" creates and renames them; from xl they can be a table.
 */
function GoalsCard({
  summary,
  onApply,
  onManageGoals,
}: {
  summary: Summary;
  onApply?: OnApply;
  onManageGoals?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const asTable = useShowsTable('painel-metas');
  const savings = summary.destinations.filter((destination) => destination.kind === 'SAVINGS');
  if (savings.length === 0) return null;
  const goalsTotal = savings.reduce((sum, destination) => sum + destination.targetCents, 0);
  return (
    <Card
      title="Metas"
      className="xl:col-span-2"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <ViewModeToggle page="painel-metas" />
          {onManageGoals && (
            <Button variant="outline" size="sm" onClick={onManageGoals}>
              Gerenciar metas
            </Button>
          )}
        </div>
      }
      help={
        <>
          <p>
            Quanto da renda líquida vai para cada meta. O limite de gastos e as metas somam até 100%
            da renda.
          </p>
          <p>
            Guardado: lançado e pago. Pendente: lançado, ainda não pago. Falta lançar: o que ainda
            não foi lançado.
          </p>
        </>
      }
    >
      {/* One above the other on the phone, where their lines under the value would wrap. */}
      <dl className="grid gap-4 sm:grid-cols-2">
        <Figure
          label="Guardado"
          help={<p>O que já foi para as metas neste mês: lançado e pago.</p>}
          sub={`de ${formatCents(goalsTotal)} das metas`}
        >
          {formatCents(summary.applied.settledCents)}
        </Figure>
        <Figure
          label="Sobra prevista"
          help={
            <>
              <p>
                As entradas previstas menos os gastos previstos. Diz se o mês cobre as metas, que
                são uma parte da renda líquida.
              </p>
              <p>
                Nas categorias "Nem renda nem gasto", um empréstimo feito diminui a sobra, e o
                dinheiro que volta ou que você pegou emprestado fica só no saldo. Uma dívida sem
                vencimento só diminui a sobra quando é paga.
              </p>
              <p>O que você guarda não entra na conta.</p>
            </>
          }
          sub={leftoverNote(summary)}
        >
          {/* Never negative (ADR 0064): the line under it says how far the expenses went. */}
          {formatCents(Math.max(0, summary.available.plannedCents))}
        </Figure>
      </dl>
      {asTable ? (
        <GoalsTable goals={savings} onApply={onApply} />
      ) : (
        // Two goals side by side only when the card itself is wide enough (a container query):
        // at 768 and 1024px, beside the sidebar, they would wrap every amount.
        <div className="@container">
          <ul className="grid gap-x-8 @3xl:grid-cols-2">
            {savings.map((destination) => (
              <GoalRow
                key={destination.destinationId}
                destination={destination}
                onApply={onApply}
              />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/**
 * "Orçamento do mês" in a card like the others (ADR 0046 note): the net income, the plan, beside
 * the month's credits without the shares of a split, what came in, and how far apart they are.
 * What each one means is behind its "ⓘ"; the difference, a fact of the month, stays in sight.
 * Where the budget comes from is behind the title's "ⓘ", and "Editar orçamento" sits in the
 * corner for whoever edits it.
 */
function BudgetCard({
  summary,
  onEditBudget,
}: {
  summary: Summary;
  onEditBudget?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const net = summary.budget.netIncomeCents;
  const income = summary.incomeCents;
  const gap = income - net;
  const versusNet =
    net > 0
      ? gap === 0
        ? 'Igual à renda'
        : `${formatCents(Math.abs(gap))} ${gap > 0 ? 'acima' : 'abaixo'} da renda`
      : null;
  // A loan repaid entered, but is not income (ADR 0056): said, so the total does not look short.
  const leftOut =
    summary.neutralIncomeCents > 0
      ? `Mais ${formatCents(summary.neutralIncomeCents)} fora da renda`
      : null;
  return (
    <Card
      title="Orçamento do mês"
      help={
        <>
          <p>{budgetOrigin(summary)}</p>
          <p>Os meses seguintes herdam o orçamento até você salvar outro.</p>
        </>
      }
      action={
        onEditBudget && (
          <Button variant="outline" size="sm" onClick={onEditBudget}>
            Editar orçamento
          </Button>
        )
      }
    >
      {/* One above the other on the phone, where "Entradas do mês" would wrap and push its value
          off the line of the other; side by side from sm, aligned at the top. */}
      <dl className="grid items-start gap-x-4 gap-y-3 sm:grid-cols-2">
        <Figure
          label="Renda líquida"
          help="A renda que você prevê para o mês, definida no orçamento. É a base do limite de gastos e das metas."
        >
          {net > 0 ? formatCents(net) : 'Não definida'}
        </Figure>
        <Figure
          label="Entradas do mês"
          help={
            'Tudo o que entra neste mês, recebido ou a receber, sem as partes das divisões ' +
            '(Reembolso) e sem as categorias marcadas "Nem renda nem gasto", que não são renda. ' +
            'Para usar este valor como renda líquida, use "Usar as entradas do mês" em ' +
            '"Editar orçamento".'
          }
          sub={[versusNet, leftOut]}
        >
          {formatCents(income)}
        </Figure>
      </dl>
      {/* The whole plan (ADR 0064): where each part of the net income goes, down to 100%. */}
      <BudgetPlan summary={summary} />
    </Card>
  );
}

/** No budget yet: one card that says what it brings, instead of empty blocks (ADR 0045 note). */
function NoBudgetCard({
  onEditBudget,
}: {
  onEditBudget?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Card title="Orçamento do mês">
      <div className="grid justify-items-start gap-3">
        <p>Nenhum orçamento definido até aqui.</p>
        {onEditBudget && (
          <>
            <p className="text-muted-foreground">
              Defina a renda líquida e quanto dela vai para gastos e para cada meta. Assim o painel
              mostra o limite de gastos e quanto guardar.
            </p>
            {/* Highlighted until the workspace has a budget (ADR 0047). */}
            <Button onClick={onEditBudget}>Definir orçamento</Button>
          </>
        )}
      </div>
    </Card>
  );
}

type PageLinks = { transactions: string };

/**
 * The month on one screen (ADRs 0031, 0045, 0046), in cards: the balance first, then the limit
 * of spending and the goals. One column up to xl; from there, the balance beside the limit and
 * the goals across, so a wide screen is used without stretching any row.
 */
function Dashboard({
  summary,
  links,
  onEditBudget,
  onApply,
  onManageGoals,
  children,
}: {
  summary: Summary;
  links: PageLinks;
  /** Opens "Gerenciar metas" (ADR 0064); absent for a VIEWER and in a closed month. */
  onManageGoals?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** What closes the page: the month's closing (ADR 0063). */
  children?: ReactNode;
  /** Opens the budget dialog; absent for a VIEWER, who cannot change it. */
  onEditBudget?: (event: MouseEvent<HTMLButtonElement>) => void;
  onApply?: OnApply;
}) {
  const hasBudget = summary.budget.source !== 'NONE';
  return (
    <div className="grid gap-4 xl:gap-6">
      <div className="empty:hidden">
        <OverdueNotice summary={summary} transactionsLink={links.transactions} />
      </div>
      {hasBudget && <BudgetCard summary={summary} onEditBudget={onEditBudget} />}
      <div className="grid items-start gap-4 xl:grid-cols-2 xl:gap-6">
        <BalanceCard summary={summary} />
        {hasBudget ? (
          <>
            <LimitCard summary={summary} />
            <GoalsCard summary={summary} onApply={onApply} onManageGoals={onManageGoals} />
          </>
        ) : (
          <NoBudgetCard onEditBudget={onEditBudget} />
        )}
      </div>
      {children}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2 xl:gap-6">
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-48 rounded-xl xl:col-span-2" />
    </div>
  );
}

/**
 * "Guardar em …" (ADRs 0047, 0051): a new debit in the destination's category, for what is
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
  // With Crédito or Débito the form asks the card (ADR 0062); it does not wait for them.
  const cards = useCards(workspaceId);
  if (!categories.isSuccess || !people.isSuccess) return null;
  return (
    <TransactionDialog
      workspaceId={workspaceId}
      period={period}
      categories={categories.data}
      people={people.data}
      cards={cards.data}
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
    // A noun, not a tense: the transaction starts pending and is paid later (ADR 0051).
    description: `Aporte em ${destination.name}`,
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
  // A closed month takes no change (ADR 0063): its budget and goals are only seen.
  const closed = useIsClosed(workspace.id, period);
  const editBudget =
    canEdit && !closed
      ? (event: MouseEvent<HTMLButtonElement>) => {
          setBudgetOpener(event.currentTarget);
          setBudgetOpen(true);
        }
      : undefined;
  // "Gerenciar metas", apart from the budget (ADR 0064), with the focus back on its button.
  const [goalsOpener, setGoalsOpener] = useState<HTMLElement | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const manageGoals =
    canEdit && !closed
      ? (event: MouseEvent<HTMLButtonElement>) => {
          setGoalsOpener(event.currentTarget);
          setGoalsOpen(true);
        }
      : undefined;
  const [application, setApplication] = useState<{
    preset: TransactionPreset;
    opener: HTMLElement;
  } | null>(null);
  const apply: OnApply | undefined =
    canEdit && !closed && summary.isSuccess
      ? (destination, event) =>
          setApplication({
            preset: applicationPreset(summary.data, destination),
            opener: event.currentTarget,
          })
      : undefined;

  return (
    <>
      <PageHeader title="Painel">
        <PeriodNav period={period} closed={closed} />
      </PageHeader>
      <QueryState queries={[summary]} skeleton={<DashboardSkeleton />} />
      {summary.isSuccess && (
        <Dashboard
          summary={summary.data}
          links={links}
          onEditBudget={editBudget}
          onApply={apply}
          onManageGoals={manageGoals}
        >
          <ClosingCard
            workspaceId={workspace.id}
            period={period}
            canEdit={canEdit}
            inheritedFrom={
              summary.data.budget.source === 'INHERITED' ? summary.data.budget.inheritedFrom : null
            }
            pendingLink={`/espacos/${workspace.id}/lancamentos?competencia=${period}&situacao=pendentes`}
          />
        </Dashboard>
      )}
      {editBudget && (
        <BudgetDialog
          workspaceId={workspace.id}
          period={period}
          incomeCents={summary.data?.incomeCents}
          open={budgetOpen}
          onOpenChange={setBudgetOpen}
          returnFocusTo={budgetOpener}
        />
      )}
      {manageGoals && (
        <DestinationsDialog
          workspaceId={workspace.id}
          open={goalsOpen}
          onOpenChange={setGoalsOpen}
          returnFocusTo={goalsOpener}
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
