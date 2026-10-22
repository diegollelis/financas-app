import {
  OVERDUE_LABEL,
  PENDING_LABEL,
  settledLabels,
  transactionStatus,
  type Transaction,
} from '@financas/shared';
import { Badge } from '@/components/ui/badge';
import { dayInPeriod } from './row-format';

/**
 * Settled and overdue always show; pending only to whoever cannot act on it, since the
 * "↓ Receber / ↑ Pagar" button already says it to an EDITOR (ADR 0036 note).
 */
export function StatusBadge({
  transaction,
  today,
  canEdit,
}: {
  transaction: Transaction;
  today: string;
  canEdit: boolean;
}) {
  const status = transactionStatus(transaction, today);
  if (status === 'SETTLED') {
    // What happened, in its own word.
    return (
      <Badge variant="success">
        {settledLabels[transaction.type]} em{' '}
        {dayInPeriod(transaction.settledAt ?? '', transaction.period)}
      </Badge>
    );
  }
  if (status === 'OVERDUE') return <Badge variant="destructive">{OVERDUE_LABEL}</Badge>;
  return canEdit ? null : <Badge variant="outline">{PENDING_LABEL}</Badge>;
}
