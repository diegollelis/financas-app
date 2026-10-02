import { formatBasisPoints, formatCents, formatPeriod, type Summary } from '@financas/shared';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { shareLabels } from '@/features/budget/share-labels';
import { usePeriod } from '@/features/periods/use-period';
import { CreditsBar } from '@/features/summary/credits-bar';
import { ExpensesMeter } from '@/features/summary/expenses-meter';
import { useSummary } from '@/features/summary/use-summary';
import { useWorkspace } from '@/features/workspaces/use-workspace';
import { ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';

/** Colored by sign, as in the spreadsheet; the minus sign keeps it readable without color. */
function SignedCents({ cents }: { cents: number }) {
  return <span className={cn(cents < 0 && 'text-destructive')}>{formatCents(cents)}</span>;
}

function StatTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-md border p-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `dashboard-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="grid gap-3">
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
    <p role="status" className="text-destructive flex items-center gap-2">
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      <span>
        {count === 1 ? '1 lançamento vencido' : `${count} lançamentos vencidos`} (
        {formatCents(cents)}).{' '}
        <Link to={transactionsLink} className="underline">
          Ver lançamentos
        </Link>
      </span>
    </p>
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

type PageLinks = { transactions: string; budget: string };

function Dashboard({ summary, links }: { summary: Summary; links: PageLinks }) {
  const { credits, debits } = summary;
  return (
    <>
      <OverdueNotice summary={summary} transactionsLink={links.transactions} />
      <Section title="Saldo e resultado">
        {/* Planned: as if everything were settled. Settled: only what happened (ADR 0031). */}
        <dl className="grid grid-cols-2 gap-3 tabular-nums">
          <StatTile label="Saldo previsto">
            <SignedCents cents={summary.balance.plannedCents} />
          </StatTile>
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
        <p className="text-muted-foreground">
          Previsto: como se tudo fosse efetivado. Efetivado: só o que já foi recebido ou pago.
          Resultado: o saldo depois de separar investimentos, reserva e viagens.
        </p>
      </Section>
      <Section title="Créditos e débitos">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums sm:grid-cols-4">
          <dt className="text-muted-foreground">Recebidos</dt>
          <dd>{formatCents(credits.settledCents)}</dd>
          <dt className="text-muted-foreground">A receber</dt>
          <dd>{formatCents(credits.pendingCents)}</dd>
          <dt className="text-muted-foreground">Pagos</dt>
          <dd>{formatCents(debits.settledCents)}</dd>
          <dt className="text-muted-foreground">A pagar</dt>
          <dd>{formatCents(debits.pendingCents)}</dd>
        </dl>
      </Section>
      <Section title="Para onde vão os créditos">
        <CreditsBar summary={summary} />
      </Section>
      <Section title="Despesas e meta">
        <ExpensesMeter summary={summary} />
      </Section>
      <Section title="Orçamento por destino">
        <p className="text-muted-foreground">
          {budgetOrigin(summary)}{' '}
          <Link to={links.budget} className="underline">
            Ver orçamento
          </Link>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full tabular-nums">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="py-1 text-left font-normal">
                  Destino
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  %
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Meta
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Previsto
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Efetivado
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.shares.map((share) => (
                <tr key={share.key} className="border-b last:border-b-0">
                  <th scope="row" className="py-1 text-left font-normal">
                    {shareLabels[share.key]}
                  </th>
                  <td className="py-1 text-right">{formatBasisPoints(share.basisPoints)}</td>
                  <td className="py-1 text-right">{formatCents(share.targetCents)}</td>
                  <td className="py-1 text-right">{formatCents(share.plannedCents)}</td>
                  <td className="py-1 text-right">{formatCents(share.settledCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground">
          Meta: sobre a renda líquida. Previsto: sobre todos os créditos. Efetivado: sobre os
          créditos recebidos.
        </p>
      </Section>
    </>
  );
}

export function DashboardPage() {
  const { workspaceId = '' } = useParams();
  const period = usePeriod();
  const workspace = useWorkspace(workspaceId);
  const summary = useSummary(workspaceId, period);
  const error = workspace.error ?? summary.error;
  const ready = workspace.isSuccess && summary.isSuccess;
  // The other pages of the same competência.
  const links: PageLinks = {
    transactions: `/espacos/${workspaceId}/lancamentos?competencia=${period}`,
    budget: `/espacos/${workspaceId}/orcamento?competencia=${period}`,
  };

  return (
    <main className="flex min-h-svh justify-center p-6">
      <Card className="w-full max-w-2xl self-start">
        <CardHeader>
          <Link
            to={`/espacos/${workspaceId}`}
            className="text-muted-foreground text-sm hover:underline"
          >
            ← {workspace.data?.name ?? 'Espaço'}
          </Link>
          <CardTitle>
            <h1>Painel</h1>
          </CardTitle>
          <CardDescription>Competência: {formatPeriod(period)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 text-sm">
          {!ready && !error && <p className="text-muted-foreground">Carregando…</p>}
          {error &&
            (error instanceof ApiError && error.status === 404 ? (
              // Same answer for "does not exist" and "not yours" (ADR 0025).
              <p role="alert">Espaço não encontrado.</p>
            ) : (
              <p role="alert" className="text-destructive">
                {apiErrorMessage(error)}
              </p>
            ))}
          {ready && <Dashboard summary={summary.data} links={links} />}
        </CardContent>
      </Card>
    </main>
  );
}
