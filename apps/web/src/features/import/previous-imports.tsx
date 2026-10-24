import { formatIsoDate, formatPeriod, type Import, type ImportKind } from '@financas/shared';
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
import { apiErrorMessage } from '@/lib/error-message';
import { useUndoImport } from './use-imports';

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

function PreviousImport({
  workspaceId,
  item,
  canEdit,
}: {
  workspaceId: string;
  item: Import;
  canEdit: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const undoRef = useRef<HTMLButtonElement>(null);
  const undo = useUndoImport(workspaceId);
  const when = dateTime.format(new Date(item.createdAt));
  // mutateAsync: once undone, this row leaves the list and its callbacks would not run.
  const confirmUndo = () =>
    void undo.mutateAsync(item.id).then(
      () => {
        toast.success('Importação desfeita');
        document.getElementById(PREVIOUS_TITLE_ID)?.focus();
      },
      (error: unknown) => toast.error(apiErrorMessage(error)),
    );

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
          <Button
            ref={undoRef}
            variant="outline"
            size="sm"
            aria-label={`Desfazer a importação de ${when}`}
            onClick={() => setConfirming(true)}
          >
            Desfazer
          </Button>
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                undoRef.current?.focus();
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Desfazer a importação de {when}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Os {item.transactionCount} lançamentos dela saem
                  {item.planCount > 0 && ', com os parcelamentos que ela criou'}, inclusive os que
                  foram editados ou marcados como pagos ou recebidos depois. Estabelecimentos e
                  apelidos ficam. Não é possível desfazer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={confirmUndo}>
                  Desfazer importação
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
