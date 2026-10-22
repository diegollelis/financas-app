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
import { cn } from '@/lib/utils';

/** Colored by sign, as in the spreadsheet; the minus sign keeps it readable without color. */
function SignedCents({ cents }: { cents: number }) {
  return <span className={cn(cents < 0 && 'text-destructive')}>{formatCents(cents)}</span>;
}

/** A labelled amount, with an optional line under it ("R$ 5.200,00 recebidos"). */
function Figure({
  label,
  help,
  sub,
  children,
}: {
  label: string;
  help?: ReactNode;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <dt className="text-muted-foreground flex items-center text-sm">
        {label}
        {help && <InfoTip term={label}>{help}</InfoTip>}
      </dt>
      <dd className="text-lg font-semibold whitespace-nowrap tabular-nums">{children}</dd>
      {sub && <dd className="text-muted-foreground text-sm tabular-nums">{sub}</dd>}
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
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <Figure label="Entradas" sub={`${formatCents(credits.settledCents)} recebidos`}>
          {formatCents(credits.totalCents)}
        </Figure>
        <Figure label="Saídas" sub={`${formatCents(debits.settledCents)} pagos`}>
          {formatCents(debits.totalCents)}
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
            gasto.
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
          <span className="text-muted-foreground text-sm font-normal">
            {formatBasisPoints(destination.basisPoints)}
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

/**
 * The saving destinations, each a share of what is left after expenses (ADR 0047), under what is
 * left to set aside and what was set aside this month.
 */
function GoalsCard({ summary, onApply }: { summary: Summary; onApply?: OnApply }) {
  const savings = summary.destinations.filter((destination) => destination.kind === 'SAVINGS');
  if (savings.length === 0) return null;
  const { unallocated } = summary;
  return (
    <Card
      title="Metas"
      className="xl:col-span-2"
      help={
        <>
          <p>
            Como você divide o que sobra entre as suas metas. Cada uma é uma parte da sobra para
            guardar, não da renda.
          </p>
          <p>
            Guardado: lançado e pago. Pendente: lançado, ainda não pago. Falta lançar: o que ainda
            não foi lançado.
          </p>
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-4">
        <Figure
          label="Sobra para guardar"
          help={
            <>
              <p>
                As entradas previstas menos as despesas previstas: é sobre esse valor que as metas
                são calculadas.
              </p>
              <p>O que você guarda não entra na conta: guardar mais não diminui as metas.</p>
            </>
          }
        >
          <SignedCents cents={summary.available.plannedCents} />
        </Figure>
        <Figure
          label="Guardado"
          help={<p>O que já foi para as metas neste mês: lançado e pago.</p>}
        >
          {formatCents(summary.applied.settledCents)}
        </Figure>
      </dl>
      {summary.available.plannedCents <= 0 && (
        <p>Nada sobrou para guardar este mês: as despesas previstas alcançaram as entradas.</p>
      )}
      {/* Two goals side by side only when the card itself is wide enough (a container query):
          at 768 and 1024px, beside the sidebar, they would wrap every amount. */}
      <div className="@container">
        <ul className="grid gap-x-8 @3xl:grid-cols-2">
          {savings.map((destination) => (
            <GoalRow key={destination.destinationId} destination={destination} onApply={onApply} />
          ))}
        </ul>
      </div>
      {unallocated.basisPoints > 0 && (
        // A forecast share of what is left, never money in the account (ADR 0051): a plain line,
        // with what it is behind its "ⓘ".
        <dl className="text-muted-foreground flex items-center justify-between gap-3 border-t pt-3 tabular-nums">
          <dt className="flex items-center">
            Sem meta ({formatBasisPoints(unallocated.basisPoints)})
            <InfoTip term="Sem meta">
              <p>
                Parte da sobra para guardar que nenhuma meta recebeu. É uma divisão do orçamento,
                não um saldo.
              </p>
            </InfoTip>
          </dt>
          <dd>{formatCents(unallocated.targetCents)}</dd>
        </dl>
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
            '(Reembolso), que não são renda. Para usar este valor como renda líquida, use ' +
            '"Usar as entradas do mês" em "Editar orçamento".'
          }
          sub={
            net > 0
              ? gap === 0
                ? 'Igual à renda'
                : `${formatCents(Math.abs(gap))} ${gap > 0 ? 'acima' : 'abaixo'} da renda`
              : undefined
          }
        >
          {formatCents(income)}
        </Figure>
      </dl>
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
}: {
  summary: Summary;
  links: PageLinks;
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
            <GoalsCard summary={summary} onApply={onApply} />
          </>
        ) : (
          <NoBudgetCard onEditBudget={onEditBudget} />
        )}
      </div>
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
          incomeCents={summary.data?.incomeCents}
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
