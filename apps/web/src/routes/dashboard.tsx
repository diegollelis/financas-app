import {
  formatBasisPoints,
  formatCents,
  formatPeriod,
  hasRole,
  type Summary,
} from '@financas/shared';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { shareLabels } from '@/features/budget/share-labels';
import { PeriodNav } from '@/features/periods/period-nav';
import { usePeriod } from '@/features/periods/use-period';
import { CreditsBar } from '@/features/summary/credits-bar';
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
  return 'Percentuais padrão: nenhum orçamento salvo até aqui.';
}

/** Each destination as a card on the phone: a five-column table does not fit in 360px. */
function DestinationCards({ summary }: { summary: Summary }) {
  return (
    <ul className="grid gap-3">
      {summary.shares.map((share) => (
        <li key={share.key} className="grid gap-2 rounded-xl border p-4">
          <p className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{shareLabels[share.key]}</span>
            <span className="text-muted-foreground">{formatBasisPoints(share.basisPoints)}</span>
          </p>
          <dl className="grid grid-cols-3 gap-2 text-sm tabular-nums">
            {(
              [
                ['Meta', share.targetCents],
                ['Previsto', share.plannedCents],
                ['Efetivado', share.settledCents],
              ] as const
            ).map(([label, cents]) => (
              <div key={label} className="grid gap-0.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{formatCents(cents)}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

/** From md, where the columns fit: the same numbers, compared down each column. */
function DestinationTable({ summary }: { summary: Summary }) {
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
            Previsto
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            Efetivado
          </th>
        </tr>
      </thead>
      <tbody>
        {summary.shares.map((share) => (
          <tr key={share.key} className="border-b last:border-b-0">
            <th scope="row" className="py-2 text-left font-normal">
              {shareLabels[share.key]}
            </th>
            <td className="py-2 text-right">{formatBasisPoints(share.basisPoints)}</td>
            <td className="py-2 text-right">{formatCents(share.targetCents)}</td>
            <td className="py-2 text-right">{formatCents(share.plannedCents)}</td>
            <td className="py-2 text-right">{formatCents(share.settledCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type PageLinks = { transactions: string; budget: string };

/**
 * The month on one screen (ADRs 0031, 0045). One column up to xl; from there, two: the balance
 * across the top, then credits and debits beside where the credits go, and the expenses goal
 * beside the budget, so a wide screen is used without stretching any row.
 */
function Dashboard({
  summary,
  links,
  canEdit,
}: {
  summary: Summary;
  links: PageLinks;
  canEdit: boolean;
}) {
  const { credits, debits } = summary;
  const desktop = useMediaQuery(DESKTOP_QUERY);
  return (
    <div className="grid gap-6 xl:grid-cols-2 xl:gap-x-10 xl:gap-y-8">
      <div className="empty:hidden xl:col-span-2">
        <OverdueNotice summary={summary} transactionsLink={links.transactions} />
      </div>
      <Section title="Saldo e resultado" className="xl:col-span-2">
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
            <StatTile label="Resultado previsto">
              <SignedCents cents={summary.result.plannedCents} />
            </StatTile>
            <StatTile label="Resultado efetivado">
              <SignedCents cents={summary.result.settledCents} />
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
          Resultado: o saldo depois de separar investimentos, reserva e viagens.
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
      <Section title="Despesas e meta">
        <ExpensesMeter summary={summary} budgetLink={links.budget} canEdit={canEdit} />
      </Section>
      <Section title="Orçamento por destino">
        <div className="grid justify-items-start gap-1">
          <p className="text-muted-foreground">{budgetOrigin(summary)}</p>
          <Button asChild variant="link" className="px-0 md:px-0">
            <Link to={links.budget}>Ver orçamento</Link>
          </Button>
        </div>
        {desktop ? <DestinationTable summary={summary} /> : <DestinationCards summary={summary} />}
        <p className="text-muted-foreground">
          Meta: sobre a renda líquida. Previsto: sobre todos os créditos. Efetivado: sobre os
          créditos recebidos.
        </p>
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

export function DashboardPage() {
  const workspace = useCurrentWorkspace();
  const period = usePeriod();
  const summary = useSummary(workspace.id, period);
  // The other pages of the same competência.
  const links: PageLinks = {
    transactions: `/espacos/${workspace.id}/lancamentos?competencia=${period}`,
    budget: `/espacos/${workspace.id}/orcamento?competencia=${period}`,
  };

  return (
    <>
      <PageHeader title="Painel">
        <PeriodNav period={period} />
      </PageHeader>
      <QueryState queries={[summary]} skeleton={<DashboardSkeleton />} />
      {summary.isSuccess && (
        <Dashboard
          summary={summary.data}
          links={links}
          canEdit={hasRole(workspace.role, 'EDITOR')}
        />
      )}
    </>
  );
}
