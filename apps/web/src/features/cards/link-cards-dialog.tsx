import type { Card, CardFunction, UnlinkedCardTransactions } from '@financas/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { apiErrorMessage } from '@/lib/error-message';
import { useLinkCard } from './use-cards';

const plural = (count: number) => (count === 1 ? '1 lançamento' : `${count} lançamentos`);

/** What each function takes: the Crédito ones still to pay, every Débito one (ADR 0062 note). */
const groups = {
  CREDIT: {
    label: (count: number) => `${count} no Crédito, ainda a pagar`,
    help: 'Os já pagos ficam como estão.',
  },
  DEBIT: { label: (count: number) => `${count} no Débito`, help: 'Todos, pagos ou não.' },
} as const satisfies Record<CardFunction, unknown>;

/**
 * After the workspace's first card: offers to give it the transactions with no card in the
 * methods of its functions, each group checked (ADR 0062 note). "Agora não" leaves them; each one
 * can still get a card in "Editar".
 */
export function LinkCardsDialog({
  workspaceId,
  card,
  unlinked,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  card: Card;
  unlinked: UnlinkedCardTransactions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const link = useLinkCard(workspaceId);
  const offered = card.functions.filter(
    (role) => unlinked[role === 'CREDIT' ? 'credit' : 'debit'] > 0,
  );
  const [chosen, setChosen] = useState<CardFunction[]>(offered);
  const countOf = (role: CardFunction) => unlinked[role === 'CREDIT' ? 'credit' : 'debit'];
  const total = chosen.reduce((sum, role) => sum + countOf(role), 0);
  const confirm = () =>
    void link.mutateAsync({ cardId: card.id, functions: chosen }).then(
      ({ linked }) => {
        toast.success(`${plural(linked)} ${linked === 1 ? 'ligado' : 'ligados'} ao ${card.name}`);
        onOpenChange(false);
      },
      (error: unknown) => toast.error(apiErrorMessage(error)),
    );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Ligar lançamentos ao ${card.name}?`}
      description="Estes lançamentos estão sem cartão. Ligados, as compras no crédito entram na fatura dele, e a Análise passa a mostrar o cartão. As recorrências e os parcelamentos em andamento desses meios também passam a usar este cartão."
    >
      <div className="grid gap-4">
        {offered.map((role) => (
          <div key={role} className="flex items-start gap-1">
            {/* A 44px target on the phone (ADR 0036), pulled left to line up with the text. */}
            <label
              htmlFor={`link-${role}`}
              className="-ml-3.5 flex size-11 shrink-0 cursor-pointer items-center justify-center md:-ml-1 md:size-6"
            >
              <Checkbox
                id={`link-${role}`}
                checked={chosen.includes(role)}
                aria-describedby={`link-${role}-help`}
                onCheckedChange={(checked) =>
                  setChosen((current) =>
                    checked === true ? [...current, role] : current.filter((item) => item !== role),
                  )
                }
              />
            </label>
            <div className="grid gap-0.5 pt-2.5 md:pt-0">
              <label htmlFor={`link-${role}`} className="cursor-pointer font-medium">
                {groups[role].label(countOf(role))}
              </label>
              <p id={`link-${role}-help`} className="text-muted-foreground text-sm">
                {groups[role].help}
              </p>
            </div>
          </div>
        ))}
        <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
          <Button type="button" disabled={total === 0 || link.isPending} onClick={confirm}>
            {link.isPending ? 'Ligando…' : `Ligar ${plural(total)}`}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Agora não
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
