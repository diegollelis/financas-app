import { paymentMethodLabels, paymentMethodRanking, type Analysis } from '@financas/shared';
import { RankingRow } from './category-ranking';
import type { AnalysisSettings } from './filters';

/**
 * How the money went out in the range (ADR 0054): each payment method, largest first, with the
 * same filters as the categories; with the type filter on credits, how it came in. "Sem meio"
 * comes last: what is left to fill in. With no method at all, a hint says where to give one.
 */
export function PaymentMethodRanking({
  analysis,
  settings,
  saving,
}: {
  analysis: Analysis;
  settings: AnalysisSettings;
  /** The saving destinations' categories: applications are not spending (ADR 0047). */
  saving: ReadonlySet<string>;
}) {
  const credit = settings.type === 'CREDIT';
  const ranking = paymentMethodRanking(analysis, settings, saving);
  const named = ranking.filter((share) => share.paymentMethod !== null);
  const largest = ranking.reduce((max, share) => Math.max(max, share.totalCents), 1);
  const title = credit ? 'Entradas por meio de recebimento' : 'Despesas por meio de pagamento';

  return (
    <section aria-labelledby="analysis-methods-title" className="grid content-start gap-3">
      <h2 id="analysis-methods-title" className="font-medium">
        {title}
      </h2>
      {ranking.length === 0 ? (
        <p className="text-muted-foreground">
          {credit ? 'Nenhuma entrada' : 'Nenhuma despesa'} no período.
        </p>
      ) : named.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum lançamento do período tem meio de pagamento. Escolha um no lançamento, logo depois
          do vencimento, para ver aqui como o dinheiro {credit ? 'entrou' : 'saiu'}.
        </p>
      ) : (
        <ul className="-mx-3 grid">
          {ranking.map((share) => (
            <RankingRow
              key={share.paymentMethod ?? 'none'}
              share={share}
              name={
                share.paymentMethod === null ? 'Sem meio' : paymentMethodLabels[share.paymentMethod]
              }
              largest={largest}
              credit={credit}
              muted={share.paymentMethod === null}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
