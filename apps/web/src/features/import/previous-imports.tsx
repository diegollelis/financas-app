import { formatIsoDate, formatPeriod, type Import, type ImportKind } from '@financas/shared';
import { Ellipsis } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { InfoTip } from '@/components/info-tip';
import { CARD_CLASS } from '@/components/section-card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiErrorMessage } from '@/lib/error-message';
import { useForgetImport, useUndoImport } from './use-imports';

const PREVIOUS_TITLE_ID = 'previous-imports';

/** "7 de out. de 2026, 09:12", in São Paulo time. */
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

/** The badge of each kind (ADR 0060). */
const kindBadges: Record<ImportKind, string> = {
  TEMPLATE: 'Planilha',
  CARD_STATEMENT: 'Fatura',
  ACCOUNT_STATEMENT: 'Conta',
};

const periodsOf = (item: Import) =>
  item.firstPeriod === item.lastPeriod
    ? formatPeriod(item.firstPeriod)
    : `${formatPeriod(item.firstPeriod)} a ${formatPeriod(item.lastPeriod)}`;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * What undoing an import also changes (ADR 0060 note), one line each: the months of a recurrence
 * that will not come back, the plans it created with their last month, the shares left unlinked,
 * and the installments made from one of its transactions that stay.
 */
function dependentLines(dependents: Import['dependents']): string[] {
  return [
    ...(dependents.recurrenceMonths > 0
      ? [
          dependents.recurrenceMonths === 1
            ? '1 lançamento virou mês de recorrência: esse mês não volta.'
            : `${dependents.recurrenceMonths} lançamentos viraram meses de recorrência: esses meses não voltam.`,
        ]
      : []),
    ...(dependents.plansUntil
      ? [
          `Os parcelamentos criados por ela saem inteiros, com as parcelas até ${formatPeriod(dependents.plansUntil)}.`,
        ]
      : []),
    ...(dependents.splitTransactions > 0
      ? [
          `${plural(dependents.splitTransactions, 'lançamento foi dividido', 'lançamentos foram divididos')}: as partes das outras pessoas ficam soltas.`,
        ]
      : []),
    ...(dependents.installmentAdoptions > 0
      ? [
          `${plural(dependents.installmentAdoptions, 'lançamento virou parcelado', 'lançamentos viraram parcelados')}: as outras parcelas ficam.`,
        ]
      : []),
  ];
}

function PreviousImport({
  workspaceId,
  item,
  canEdit,
}: {
  workspaceId: string;
  item: Import;
  canEdit: boolean;
}) {
  const [confirming, setConfirming] = useState<'undo' | 'forget' | null>(null);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const undo = useUndoImport(workspaceId);
  const forget = useForgetImport(workspaceId);
  const when = dateTime.format(new Date(item.createdAt));
  // mutateAsync: once gone, this row leaves the list and its callbacks would not run.
  const confirm = (action: 'undo' | 'forget') =>
    void (action === 'undo' ? undo : forget).mutateAsync(item.id).then(
      () => {
        toast.success(
          action === 'undo' ? 'Importação desfeita' : 'Importação removida do histórico',
        );
        document.getElementById(PREVIOUS_TITLE_ID)?.focus();
      },
      (error: unknown) => toast.error(apiErrorMessage(error)),
    );
  const touched = dependentLines(item.dependents);

  const counts = `${item.transactionCount} ${item.transactionCount === 1 ? 'lançamento' : 'lançamentos'}${
    item.planCount > 0
      ? ` e ${item.planCount} ${item.planCount === 1 ? 'parcelamento' : 'parcelamentos'}`
      : ''
  }, ${periodsOf(item)}`;
  // Its "Origem" and the statement's due date tell it apart (ADR 0055 note); an import made
  // before them shows what it brought, as it always did.
  const name = item.label
    ? `${item.label}${item.statementDueDate ? ` · vence ${formatIsoDate(item.statementDueDate)}` : ''}`
    : null;

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="grid min-w-0 gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium break-words">
          <Badge variant={item.kind === 'TEMPLATE' ? 'outline' : 'secondary'}>
            {kindBadges[item.kind]}
          </Badge>
          {name ?? counts}
        </p>
        <p className="text-muted-foreground text-sm">
          {name && `${counts} · `}
          {when}
          {item.createdBy && `, por ${item.createdBy.name}`}
        </p>
      </div>
      {canEdit && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={actionsRef}
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações da importação de ${when}`}
              >
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-max">
              <DropdownMenuItem onSelect={() => setConfirming('forget')}>
                Remover do histórico
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirming('undo')}>
                Desfazer importação
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialog
            open={confirming !== null}
            onOpenChange={(open) => !open && setConfirming(null)}
          >
            <AlertDialogContent
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                actionsRef.current?.focus();
              }}
            >
              {confirming === 'forget' ? (
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover a importação de {when} do histórico?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Os lançamentos e os parcelamentos dela ficam como estão, como se lançados à mão.
                    Só não será mais possível desfazer esta importação de uma vez.
                  </AlertDialogDescription>
                </AlertDialogHeader>
              ) : (
                <AlertDialogHeader>
                  <AlertDialogTitle>Desfazer a importação de {when}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {item.transactionCount === 1
                      ? 'O lançamento dela sai'
                      : `Os ${item.transactionCount} lançamentos dela saem`}
                    {item.planCount > 0 && ', com os parcelamentos que ela criou'},{' '}
                    {item.transactionCount === 1
                      ? 'mesmo se foi editado ou marcado como pago ou recebido depois'
                      : 'inclusive os que foram editados ou marcados como pagos ou recebidos depois'}
                    . Estabelecimentos e apelidos ficam. Não é possível desfazer.
                  </AlertDialogDescription>
                  {/* What was built on it since (ADR 0060 note): said before, not found after. */}
                  {touched.length > 0 && (
                    <div className="bg-accent grid gap-1 rounded-md p-3 text-left text-sm">
                      <p className="font-medium">Também muda:</p>
                      <ul className="list-disc pl-5">
                        {touched.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      <p className="text-muted-foreground">
                        Para só limpar o histórico, use "Remover do histórico".
                      </p>
                    </div>
                  )}
                </AlertDialogHeader>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  variant={confirming === 'forget' ? 'default' : 'destructive'}
                  onClick={() => confirming && confirm(confirming)}
                >
                  {confirming === 'forget' ? 'Remover do histórico' : 'Desfazer importação'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </li>
  );
}

/**
 * The imports of one page (ADR 0060): the statements on one, the spreadsheets on the other, in a
 * card of their own apart from the new import. Nothing shows while there are none.
 */
export function PreviousImports({
  workspaceId,
  items,
  canEdit,
  title,
  help,
}: {
  workspaceId: string;
  items: Import[];
  canEdit: boolean;
  /** "Extratos importados", "Planilhas importadas". */
  title: string;
  help: string;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={PREVIOUS_TITLE_ID} className={CARD_CLASS}>
      <div className="flex items-center">
        {/* Focusable from script: where focus goes after undoing one. */}
        <h2 id={PREVIOUS_TITLE_ID} tabIndex={-1} className="font-semibold outline-none">
          {title}
        </h2>
        <InfoTip term={title}>{help}</InfoTip>
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <PreviousImport key={item.id} workspaceId={workspaceId} item={item} canEdit={canEdit} />
        ))}
      </ul>
    </section>
  );
}
