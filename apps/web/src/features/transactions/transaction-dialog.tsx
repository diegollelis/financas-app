import { formatPeriod, type Category, type Person, type Transaction } from '@financas/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { useCreateInstallmentPlan } from '@/features/installments/use-installments';
import { findPerson, useResolvePerson } from '@/features/people/use-people';
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
 * transactions page and, with a `preset`, by the dashboard's "Registrar aplicação" (ADR 0047).
 */
export function TransactionDialog({
  workspaceId,
  period,
  categories,
  people,
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
    // A name typed in "A receber de" / "A pagar para": the person, created when new (ADR 0042).
    let personId: string | null;
    try {
      personId = values.repeat === 'NONE' ? await person.resolve(values.person) : null;
    } catch {
      return; // Shown by the form, from person.error.
    }
    const fields = {
      type: values.type,
      description: values.description,
      notes: values.notes ?? null,
      categoryId: values.categoryId,
      amountCents: values.amount,
    };
    if (editing) {
      update.mutate(
        { id: editing.id, ...fields, dueDate: values.dueDate, personId },
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
          dueDay: values.dueDate ? Number(values.dueDate.slice(8)) : null,
        },
        { onSuccess: done(`Parcelamento adicionado: ${installments} parcelas`) },
      );
    } else if (values.repeat === 'MONTHLY') {
      // Every month from this one, due on the same day (ADR 0038).
      setRepeat('MONTHLY');
      createRecurrence.mutate(
        {
          ...fields,
          dueDay: values.dueDate ? Number(values.dueDate.slice(8)) : null,
          startPeriod: period,
          variableAmount: values.amountKind === 'VARIABLE',
        },
        { onSuccess: done('Lançamento adicionado, repetindo todo mês') },
      );
    } else if (values.splitOn && values.type === 'DEBIT') {
      // The debit and one "a receber" per person, at once (ADR 0042). A name already listed
      // goes by id; a new one becomes a person in the same request.
      setRepeat('NONE');
      const split = values.shares.map((share) => {
        const listed = findPerson(people, share.name);
        const amountCents = shareCents(values.amount, share.value, values.shareMode) ?? 0;
        return listed && !listed.archived
          ? { personId: listed.id, amountCents }
          : { newPersonName: share.name.trim(), amountCents };
      });
      create.mutate(
        { ...fields, dueDate: values.dueDate, period, split },
        {
          onSuccess: done(
            `Lançamento adicionado, dividido com ${split.length} ${split.length === 1 ? 'pessoa' : 'pessoas'}`,
          ),
        },
      );
    } else {
      setRepeat('NONE');
      create.mutate(
        { ...fields, dueDate: values.dueDate, period, personId },
        { onSuccess: done('Lançamento adicionado') },
      );
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={editing ? 'Editar lançamento' : 'Novo lançamento'}
      description={
        // Editing one generated month or one installment changes only it (ADR 0038).
        editing?.recurrenceId
          ? `Competência de ${formatPeriod(editing.period)} em ${workspaceName}. Repete todo mês: esta mudança vale só para este mês.`
          : editing?.installment
            ? `Competência de ${formatPeriod(editing.period)} em ${workspaceName}. Parcela ${editing.installment.number} de ${editing.installment.count}: esta mudança vale só para esta parcela.`
            : `Competência de ${formatPeriod(editing?.period ?? period)} em ${workspaceName}.`
      }
    >
      <TransactionForm
        // A new form each time: empty for a new one, the values of the one being edited.
        key={editing?.id ?? 'new'}
        idPrefix={editing?.id ?? 'new'}
        categories={categories}
        people={people}
        initial={editing ?? undefined}
        preset={editing ? undefined : preset}
        submitLabel={
          editing
            ? update.isPending
              ? 'Salvando…'
              : 'Salvar'
            : mutation.isPending
              ? 'Adicionando…'
              : 'Adicionar'
        }
        pending={mutation.isPending || person.isPending}
        error={person.error ?? mutation.error}
        onSubmit={(values) => void submit(values)}
        onCancel={() => onOpenChange(false)}
        allowRepeat={!editing}
      />
    </ResponsiveDialog>
  );
}
