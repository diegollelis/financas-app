import {
  formatPeriod,
  normalizeName,
  parsePercent,
  type Category,
  type CategoryHints,
  type Merchant,
  type Person,
  type Transaction,
} from '@financas/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { useResolveCategory } from '@/features/categories/new-category';
import { useCreateInstallmentPlan } from '@/features/installments/use-installments';
import { useResolveMerchant } from '@/features/merchants/use-merchants';
import { findPerson, useResolvePerson } from '@/features/people/use-people';
import { dueOf } from '@/features/recurrences/due';
import { useCreateRecurrence } from '@/features/recurrences/use-recurrences';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { shareCents } from './split';
import {
  TransactionForm,
  type TransactionFormValues,
  type TransactionPreset,
} from './transaction-form';
import { useCreateTransaction, useUpdateTransaction } from './use-transactions';

/**
 * Create or edit a transaction, in a sheet on the phone and a dialog from md. Used by the
 * transactions page and, with a `preset`, by the dashboard's "Guardar", titled "Registrar valor guardado" (ADRs 0047, 0051).
 */
export function TransactionDialog({
  workspaceId,
  period,
  categories,
  people,
  merchants = [],
  hints,
  editing,
  preset,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  period: string;
  categories: Category[];
  people: Person[];
  /** The workspace's merchants (ADR 0053); none for an application to a destination. */
  merchants?: Merchant[];
  /** The history's categories (ADR 0053), to fill a new transaction's category. */
  hints?: CategoryHints;
  /** The transaction being edited; null to create one. */
  editing: Transaction | null;
  /** For a new one: values to start from (an application to a destination, ADR 0047). */
  preset?: TransactionPreset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened the form, to get the focus back on close. */
  returnFocusTo: HTMLElement | null;
}) {
  // Where it goes (ADR 0044): the workspace by name, where a mistake would cost the most.
  const { name: workspaceName } = useCurrentWorkspace();
  const create = useCreateTransaction(workspaceId);
  const createRecurrence = useCreateRecurrence(workspaceId);
  const createPlan = useCreateInstallmentPlan(workspaceId);
  const update = useUpdateTransaction(workspaceId);
  const person = useResolvePerson(workspaceId, people);
  const merchant = useResolveMerchant(workspaceId, merchants);
  const category = useResolveCategory(workspaceId, categories);
  // Which kind of creation was last submitted: its pending state and error are the form's.
  const [repeat, setRepeat] = useState<TransactionFormValues['repeat']>('NONE');
  const mutation = editing
    ? update
    : repeat === 'MONTHLY'
      ? createRecurrence
      : repeat === 'INSTALLMENTS'
        ? createPlan
        : create;
  const done = (message: string) => () => {
    toast.success(message);
    onOpenChange(false);
  };
  const submit = async (values: TransactionFormValues) => {
    // The name picked in "A receber de" / "A pagar para": the person, created when new (ADR 0042),
    // for a recurrence or an installment plan too (ADR 0052). A split names its people itself.
    const splitting = values.splitOn;
    // Each share's person as the API takes it (ADRs 0042, 0052): a name already listed goes by
    // id, a new one becomes a person in the same request.
    const who = (name: string) => {
      const listed = findPerson(people, name);
      return listed && !listed.archived ? { personId: listed.id } : { newPersonName: name.trim() };
    };
    // In reais; in an installment plan, in the meaning of the amount typed (of the total, or of
    // each installment).
    const split = values.shares.map((share) => ({
      ...who(share.name),
      amountCents: shareCents(values.amount, share.value, values.shareMode) ?? 0,
    }));
    // A recurrence keeps a percentage as one, so it follows the amount of each month.
    const recurrenceSplit = values.shares.map((share) =>
      values.shareMode === 'PERCENT'
        ? { ...who(share.name), basisPoints: parsePercent(share.value) ?? 0 }
        : { ...who(share.name), amountCents: shareCents(values.amount, share.value, 'REAIS') ?? 0 },
    );
    const withPeople = (message: string) =>
      splitting
        ? `${message}, dividido com ${split.length} ${split.length === 1 ? 'pessoa' : 'pessoas'}`
        : message;
    // The merchant being edited stays as it is, even archived: resolving it would reactivate it.
    const current = merchants.find((item) => item.id === editing?.merchantId);
    let personId: string | null;
    let merchantId: string | null;
    let categoryId: string;
    try {
      // A category added in the form is created now (or an archived one of that name comes back).
      categoryId = await category.resolve(values.categoryId, values.type);
      personId = splitting ? null : await person.resolve(values.person);
      merchantId =
        current && normalizeName(current.name) === normalizeName(values.merchant)
          ? current.id
          : await merchant.resolve(values.merchant);
    } catch {
      return; // Shown by the form, from the resolver's error.
    }
    const fields = {
      type: values.type,
      description: values.description,
      notes: values.notes ?? null,
      categoryId,
      amountCents: values.amount,
    };
    // A new one names its merchant only when there is one; an edit always does (null unlinks).
    const withMerchant = merchantId ? { merchantId } : {};
    if (editing) {
      update.mutate(
        { id: editing.id, ...fields, dueDate: values.dueDate, personId, merchantId },
        { onSuccess: done('Lançamento salvo') },
      );
    } else if (values.repeat === 'INSTALLMENTS') {
      // All installments at once, one per month from this one (ADR 0038).
      setRepeat('INSTALLMENTS');
      const installments = Number(values.installments);
      createPlan.mutate(
        {
          type: fields.type,
          description: fields.description,
          notes: fields.notes,
          categoryId: fields.categoryId,
          installments,
          amountCents: fields.amountCents,
          amountIs: values.amountIs,
          firstPeriod: period,
          ...dueOf(period, values.dueDate),
          personId,
          ...withMerchant,
          ...(splitting && { split }),
        },
        { onSuccess: done(withPeople(`Parcelamento adicionado: ${installments} parcelas`)) },
      );
    } else if (values.repeat === 'MONTHLY') {
      // Every month from this one, due on the same day, in its month or the next (ADR 0038).
      setRepeat('MONTHLY');
      createRecurrence.mutate(
        {
          ...fields,
          ...dueOf(period, values.dueDate),
          startPeriod: period,
          variableAmount: values.amountKind === 'VARIABLE',
          personId,
          ...withMerchant,
          ...(splitting && { split: recurrenceSplit }),
        },
        { onSuccess: done(withPeople('Lançamento adicionado, repetindo todo mês')) },
      );
    } else if (splitting) {
      // The transaction and one share per person on the other side, at once (ADRs 0042, 0052).
      setRepeat('NONE');
      create.mutate(
        { ...fields, dueDate: values.dueDate, period, ...withMerchant, split },
        { onSuccess: done(withPeople('Lançamento adicionado')) },
      );
    } else {
      setRepeat('NONE');
      create.mutate(
        { ...fields, dueDate: values.dueDate, period, personId, ...withMerchant },
        { onSuccess: done('Lançamento adicionado') },
      );
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={
        editing
          ? 'Editar lançamento'
          : preset?.applicationTo
            ? // A record of money put aside, not an investment the app makes (ADR 0051).
              'Registrar valor guardado'
            : 'Novo lançamento'
      }
      description={
        // Editing one generated month or one installment changes only it (ADR 0038).
        !editing && preset?.applicationTo
          ? `Em ${preset.applicationTo}, no mês de ${formatPeriod(period)} em ${workspaceName}.`
          : editing?.recurrenceId
            ? `Mês de ${formatPeriod(editing.period)} em ${workspaceName}. Repete todo mês: esta mudança vale só para este mês.`
            : editing?.installment
              ? `Mês de ${formatPeriod(editing.period)} em ${workspaceName}. Parcela ${editing.installment.number} de ${editing.installment.count}: esta mudança vale só para esta parcela.`
              : `Mês de ${formatPeriod(editing?.period ?? period)} em ${workspaceName}.`
      }
    >
      <TransactionForm
        // A new form each time: empty for a new one, the values of the one being edited.
        key={editing?.id ?? 'new'}
        idPrefix={editing?.id ?? 'new'}
        categories={categories}
        people={people}
        merchants={merchants}
        hints={hints}
        initial={editing ?? undefined}
        preset={editing ? undefined : preset}
        period={period}
        submitLabel={
          editing
            ? update.isPending
              ? 'Salvando…'
              : 'Salvar'
            : mutation.isPending
              ? 'Adicionando…'
              : 'Adicionar'
        }
        pending={mutation.isPending || person.isPending || merchant.isPending || category.isPending}
        error={category.error ?? person.error ?? merchant.error ?? mutation.error}
        onSubmit={(values) => void submit(values)}
        onCancel={() => onOpenChange(false)}
        allowRepeat={!editing}
      />
    </ResponsiveDialog>
  );
}
