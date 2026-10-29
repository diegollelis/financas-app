import {
  currentPeriod,
  formatCents,
  formatIsoDate,
  formatPeriod,
  reopenPeriodInputSchema,
  REOPEN_REASON_MAX,
  type PeriodClosing,
  type PeriodPending,
  type ReopenPeriodInput,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { QueryState } from '@/components/query-state';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { SectionCard } from '@/components/section-card';
import { useDialogDirty } from '@/components/dialog-dirty';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/error-message';
import { useClosePeriod, useClosing, useReopenPeriod } from './use-closing';

/** The day of a timestamp in São Paulo, as the rest of the app shows dates. */
const dayFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });
const dayOf = (timestamp: string) => dayFormat.format(new Date(timestamp));

/** "Fechado em 29/10/2026 por Maria Exemplo." The name is gone once that account is. */
function closedText(closing: PeriodClosing) {
  return `Fechado em ${dayOf(closing.closedAt)}${closing.closedBy ? ` por ${closing.closedBy}` : ''}.`;
}

/** A closing that was reopened, with who reopened it and why. */
function reopenedText(closing: PeriodClosing) {
  const by = closing.reopenedBy ? ` por ${closing.reopenedBy}` : '';
  return `${closedText(closing)} Reaberto em ${dayOf(closing.reopenedAt!)}${by}: ${closing.reopenReason}`;
}

const MAX_PENDING_SHOWN = 5;

function PendingList({ pending }: { pending: PeriodPending[] }) {
  const shown = pending.slice(0, MAX_PENDING_SHOWN);
  return (
    <ul className="grid">
      {shown.map((item) => (
        <li
          key={item.id}
          className="flex items-start justify-between gap-3 border-t py-2 first:border-t-0 first:pt-0"
        >
          <span className="grid min-w-0">
            <span className="break-words">{item.description}</span>
            {item.dueDate && (
              <span className="text-muted-foreground text-sm">
                Vence em {formatIsoDate(item.dueDate)}
              </span>
            )}
          </span>
          <span
            className={
              item.type === 'CREDIT'
                ? 'text-credit-foreground font-semibold whitespace-nowrap tabular-nums'
                : 'font-semibold whitespace-nowrap tabular-nums'
            }
          >
            {item.type === 'CREDIT' ? '+ ' : '− '}
            {formatCents(item.amountCents)}
          </span>
        </li>
      ))}
      {pending.length > shown.length && (
        <li className="text-muted-foreground border-t pt-2 text-sm">
          E mais {pending.length - shown.length}.
        </li>
      )}
    </ul>
  );
}

/**
 * "Fechamento do mês" on the dashboard (ADR 0063): what still keeps the month from closing,
 * "Fechar mês" once nothing does, and, closed, who closed it, "Reabrir mês" and every reopening
 * with its reason. A VIEWER sees the same, with no button.
 */
export function ClosingCard({
  workspaceId,
  period,
  canEdit,
  inheritedFrom,
  pendingLink,
}: {
  workspaceId: string;
  period: string;
  canEdit: boolean;
  /** The month the budget comes from, while inherited: closing saves it as this month's own. */
  inheritedFrom: string | null;
  /** Lançamentos of this month, filtered to the pending ones. */
  pendingLink: string;
}) {
  const closing = useClosing(workspaceId, period);
  const [confirming, setConfirming] = useState(false);
  const [reopening, setReopening] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const reopenButton = useRef<HTMLButtonElement>(null);
  const month = formatPeriod(period);
  // The API closes only a month that has started.
  const started = period <= currentPeriod();

  return (
    <SectionCard
      title="Fechamento do mês"
      help={
        <>
          <p>
            Fechar o mês trava os lançamentos e o orçamento dele, para nada mudar por engano. Para
            corrigir algo, reabra o mês dizendo o motivo.
          </p>
          <p>
            Só dá para fechar com tudo pago e recebido. Um empréstimo sem vencimento numa categoria
            "Nem renda nem gasto" não impede o fechamento.
          </p>
        </>
      }
    >
      <QueryState queries={[closing]} skeleton={<Skeleton className="h-16" />} />
      {closing.isSuccess &&
        (closing.data.closing ? (
          <div className="grid justify-items-start gap-3">
            <p className="flex items-center gap-2">
              <Lock aria-hidden className="text-muted-foreground size-4 shrink-0" />
              {closedText(closing.data.closing)}
            </p>
            <p className="text-muted-foreground text-sm">
              Nada deste mês muda até ele ser reaberto.
            </p>
            {canEdit && (
              <Button
                ref={reopenButton}
                variant="outline"
                size="sm"
                onClick={() => setReopening(true)}
              >
                Reabrir mês
              </Button>
            )}
          </div>
        ) : closing.data.pending.length > 0 ? (
          <div className="grid justify-items-start gap-3">
            <p>
              {closing.data.pending.length === 1
                ? `Falta 1 lançamento para fechar ${month}.`
                : `Faltam ${closing.data.pending.length} lançamentos para fechar ${month}.`}
            </p>
            <div className="w-full">
              <PendingList pending={closing.data.pending} />
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={pendingLink}>Ver pendentes</Link>
            </Button>
          </div>
        ) : !started ? (
          <p className="text-muted-foreground">
            O mês ainda não começou: ele pode ser fechado a partir do primeiro dia.
          </p>
        ) : (
          <div className="grid justify-items-start gap-3">
            <p>Tudo de {month} foi pago e recebido.</p>
            {canEdit && (
              <Button
                ref={closeButton}
                variant="outline"
                size="sm"
                onClick={() => setConfirming(true)}
              >
                Fechar mês
              </Button>
            )}
          </div>
        ))}
      {closing.isSuccess && closing.data.history.some((item) => item.reopenedAt) && (
        <div className="grid gap-2 border-t pt-3">
          <h3 className="font-medium">Reaberturas</h3>
          <ul className="text-muted-foreground grid gap-2 text-sm">
            {closing.data.history
              .filter((item) => item.reopenedAt)
              .map((item) => (
                <li key={item.id} className="break-words">
                  {reopenedText(item)}
                </li>
              ))}
          </ul>
        </div>
      )}
      {canEdit && (
        <CloseDialog
          workspaceId={workspaceId}
          period={period}
          inheritedFrom={inheritedFrom}
          open={confirming}
          onOpenChange={setConfirming}
          returnFocusTo={closeButton}
        />
      )}
      {canEdit && (
        <ReopenDialog
          workspaceId={workspaceId}
          period={period}
          open={reopening}
          onOpenChange={setReopening}
          returnFocusTo={reopenButton}
        />
      )}
    </SectionCard>
  );
}

/**
 * "Fechar <mês>?": what locks, what the budget becomes and what still changes what the month
 * shows (ADR 0063), before closing.
 */
function CloseDialog({
  workspaceId,
  period,
  inheritedFrom,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  period: string;
  inheritedFrom: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  const close = useClosePeriod(workspaceId, period);
  const confirm = () =>
    close.mutate(undefined, {
      onSuccess: () => {
        onOpenChange(false);
        toast.success('Mês fechado');
      },
    });
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Fechar {formatPeriod(period)}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <ul className="grid list-disc gap-1.5 pl-5 text-left">
              <li>
                Os lançamentos e o orçamento do mês deixam de aceitar mudanças até alguém reabrir o
                mês.
              </li>
              {inheritedFrom && (
                <li>
                  O orçamento herdado de {formatPeriod(inheritedFrom)} passa a ser o deste mês.
                </li>
              )}
              <li>Um empréstimo sem vencimento ainda aceita recebimento ou pagamento parcial.</li>
              <li>
                Renomear uma categoria ou marcar "Nem renda nem gasto" ainda muda o que o mês
                mostra.
              </li>
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {close.isError && (
          <p role="alert" className="text-destructive">
            {apiErrorMessage(close.error)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {/* Not an AlertDialogAction: the dialog stays open until the API answers. */}
          <Button onClick={confirm} disabled={close.isPending}>
            {close.isPending ? 'Fechando…' : 'Fechar mês'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** "Reabrir <mês>": the reason is required and stays in the history (ADR 0063). */
export function ReopenDialog({
  workspaceId,
  period,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  period: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={`Reabrir ${formatPeriod(period)}`}
      description="O mês volta a aceitar mudanças. O motivo fica no histórico do fechamento."
    >
      {/* Mounted on each opening: no reason or error left over. */}
      {open && (
        <ReopenForm workspaceId={workspaceId} period={period} onDone={() => onOpenChange(false)} />
      )}
    </ResponsiveDialog>
  );
}

function ReopenForm({
  workspaceId,
  period,
  onDone,
}: {
  workspaceId: string;
  period: string;
  onDone: () => void;
}) {
  const reopen = useReopenPeriod(workspaceId, period);
  const { register, handleSubmit, formState } = useForm<ReopenPeriodInput>({
    resolver: zodResolver(reopenPeriodInputSchema),
    defaultValues: { reason: '' },
  });
  // Closing the dialog by mistake with something typed asks first.
  useDialogDirty(formState.isDirty);
  const onSubmit = (input: ReopenPeriodInput) =>
    reopen.mutate(input, {
      onSuccess: () => {
        onDone();
        toast.success('Mês reaberto');
      },
    });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <FormField id="reopen-reason" label="Motivo" error={formState.errors.reason?.message}>
        <Textarea rows={3} maxLength={REOPEN_REASON_MAX} {...register('reason')} />
      </FormField>
      {reopen.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(reopen.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={reopen.isPending}>
          {reopen.isPending ? 'Reabrindo…' : 'Reabrir mês'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * Over the transactions of a closed month (ADR 0063): they can only be seen, and whoever edits
 * can reopen it from here.
 */
export function ClosedNotice({
  workspaceId,
  period,
  canEdit,
}: {
  workspaceId: string;
  period: string;
  canEdit: boolean;
}) {
  const [reopening, setReopening] = useState(false);
  const reopenButton = useRef<HTMLButtonElement>(null);
  return (
    <div
      role="status"
      className="bg-muted grid gap-3 rounded-xl p-4 sm:flex sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2 font-medium">
        <Lock aria-hidden className="mt-0.5 size-5 shrink-0" />
        <span className="first-letter:uppercase">
          {formatPeriod(period)} está fechado: os lançamentos só podem ser vistos.
        </span>
      </p>
      {canEdit && (
        <>
          <Button
            ref={reopenButton}
            variant="outline"
            className="justify-self-start"
            onClick={() => setReopening(true)}
          >
            Reabrir mês
          </Button>
          <ReopenDialog
            workspaceId={workspaceId}
            period={period}
            open={reopening}
            onOpenChange={setReopening}
            returnFocusTo={reopenButton}
          />
        </>
      )}
    </div>
  );
}
