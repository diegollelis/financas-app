import {
  createRecurrenceInputSchema,
  dueDaySchema,
  reaisInputSchema,
  type Category,
  type Recurrence,
  type UpdateRecurrenceInput,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CategorySelect } from '@/features/transactions/transaction-form';
import { apiErrorMessage } from '@/lib/error-message';

/** What can change in a recurrence: not its type nor its start (ADR 0038). */
const recurrenceFormSchema = createRecurrenceInputSchema
  .pick({ description: true, notes: true })
  .extend({
    categoryId: z.string().min(1, 'Escolha uma categoria.'),
    amount: reaisInputSchema,
    /** Typed as text; blank = no due date. */
    dueDay: z
      .string()
      .trim()
      .transform((day) => (day === '' ? null : Number(day)))
      .pipe(dueDaySchema.nullable()),
    amountKind: z.enum(['FIXED', 'VARIABLE']),
  });

type FormInput = z.input<typeof recurrenceFormSchema>;
type FormValues = z.output<typeof recurrenceFormSchema>;

const amountText = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });

const amountKindOptions = [
  { value: 'FIXED', label: 'Fixo' },
  { value: 'VARIABLE', label: 'Variável' },
] as const;

/**
 * Only the fields that changed: the API copies every field it gets to the pending transactions
 * from this month on, and an unchanged one would undo a month adjusted by hand.
 */
function recurrenceChanges(recurrence: Recurrence, values: FormValues) {
  const changes: UpdateRecurrenceInput = {};
  if (values.description !== recurrence.description) changes.description = values.description;
  if ((values.notes ?? null) !== recurrence.notes) changes.notes = values.notes ?? null;
  if (values.categoryId !== recurrence.categoryId) changes.categoryId = values.categoryId;
  if (values.amount !== recurrence.amountCents) changes.amountCents = values.amount;
  if (values.dueDay !== recurrence.dueDay) changes.dueDay = values.dueDay;
  const variableAmount = values.amountKind === 'VARIABLE';
  if (variableAmount !== recurrence.variableAmount) changes.variableAmount = variableAmount;
  return changes;
}

export function RecurrenceForm({
  recurrence,
  categories,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  recurrence: Recurrence;
  categories: Category[];
  pending: boolean;
  error: unknown;
  /** Only what changed; empty when nothing did. */
  onSubmit: (changes: UpdateRecurrenceInput) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState, control } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(recurrenceFormSchema),
    defaultValues: {
      description: recurrence.description,
      notes: recurrence.notes ?? '',
      categoryId: recurrence.categoryId,
      amount: amountText.format(recurrence.amountCents / 100),
      dueDay: recurrence.dueDay === null ? '' : String(recurrence.dueDay),
      amountKind: recurrence.variableAmount ? 'VARIABLE' : 'FIXED',
    },
  });
  const variable = useWatch({ control, name: 'amountKind' }) === 'VARIABLE';
  // Only categories of its type; an archived one only if it is already the current one.
  const options = categories.filter(
    (category) =>
      category.type === recurrence.type &&
      (!category.archived || category.id === recurrence.categoryId),
  );
  const id = (field: string) => `recurrence-${recurrence.id}-${field}`;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) =>
        void handleSubmit((values) => onSubmit(recurrenceChanges(recurrence, values)))(event)
      }
    >
      <FormField
        id={id('description')}
        label="Descrição"
        error={formState.errors.description?.message}
      >
        <Input autoComplete="off" {...register('description')} />
      </FormField>
      <Controller
        control={control}
        name="categoryId"
        render={({ field, fieldState }) => (
          <FormField id={id('category')} label="Categoria" error={fieldState.error?.message}>
            <CategorySelect value={field.value} onChange={field.onChange} options={options} />
          </FormField>
        )}
      />
      <div className="grid gap-2">
        <p aria-hidden className="text-sm font-medium">
          Valor
        </p>
        <Controller
          control={control}
          name="amountKind"
          render={({ field }) => (
            <SegmentedControl
              label="Valor"
              options={amountKindOptions}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      {/* One column on the phone, two from sm. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={id('amount')}
          label={variable ? 'Valor estimado (R$)' : 'Valor (R$)'}
          error={formState.errors.amount?.message}
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            className="tabular-nums"
            {...register('amount')}
          />
        </FormField>
        <FormField
          id={id('due-day')}
          label="Dia do vencimento (opcional)"
          error={formState.errors.dueDay?.message}
        >
          <Input
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ex.: 10"
            className="tabular-nums"
            {...register('dueDay')}
          />
        </FormField>
      </div>
      <p className="text-muted-foreground text-sm">
        {variable
          ? 'Um valor novo substitui as estimativas pendentes; os meses cujo valor já foi informado ficam como estão. Os meses seguintes começam pela média dos 3 últimos pagos.'
          : 'Num mês sem esse dia, o vencimento é o último dia do mês.'}
      </p>
      <FormField
        id={id('notes')}
        label="Observações (opcional)"
        error={formState.errors.notes?.message}
      >
        <Input autoComplete="off" {...register('notes')} />
      </FormField>
      {Boolean(error) && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
