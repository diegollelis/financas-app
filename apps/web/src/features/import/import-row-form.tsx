import {
  isoDateSchema,
  periodSchema,
  reaisInputSchema,
  transactionDescriptionSchema,
  transactionNotesSchema,
  transactionTypeSchema,
  type Category,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CategorySelect } from '@/features/transactions/transaction-form';
import type { ReviewRow } from './review';

/** Empty means none; anything else must be a real date. */
const optionalDate = z
  .string()
  .transform((date) => date || null)
  .pipe(isoDateSchema.nullable());

/**
 * One spreadsheet row, fixed before the import (ADR 0040): the fields of a new transaction plus
 * the competência and the settlement date, which the spreadsheet carries. Same shared rules.
 */
const rowFormSchema = z.object({
  type: transactionTypeSchema,
  description: transactionDescriptionSchema,
  categoryId: z.string().min(1, 'Escolha uma categoria.'),
  amount: reaisInputSchema,
  period: periodSchema,
  dueDate: optionalDate,
  settledAt: optionalDate,
  notes: transactionNotesSchema,
});

type FormInput = z.input<typeof rowFormSchema>;
type FormValues = z.output<typeof rowFormSchema>;

const amountText = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });

const typeOptions = [
  { value: 'DEBIT', label: 'Débito' },
  { value: 'CREDIT', label: 'Crédito' },
] as const;

export function ImportRowForm({
  row,
  categories,
  categoryId,
  onSave,
  onCancel,
}: {
  row: ReviewRow;
  categories: Category[];
  /** The category the row goes to now, if any. */
  categoryId: string | null;
  /** The row as fixed, checked again for the import. */
  onSave: (row: ReviewRow) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState, control, setValue } = useForm<
    FormInput,
    unknown,
    FormValues
  >({
    resolver: zodResolver(rowFormSchema),
    defaultValues: {
      type: row.type ?? 'DEBIT',
      description: row.description,
      categoryId: categoryId ?? '',
      amount:
        row.amountCents && row.amountCents > 0 ? amountText.format(row.amountCents / 100) : '',
      period: row.period ?? '',
      dueDate: row.dueDate ?? '',
      settledAt: row.settledAt ?? '',
      notes: row.notes ?? '',
    },
  });
  const type = useWatch({ control, name: 'type' });
  const options = categories.filter((category) => category.type === type && !category.archived);
  const id = (field: string) => `import-row-${row.line}-${field}`;
  const save = (values: FormValues) =>
    onSave({
      ...row,
      included: true,
      type: values.type,
      description: values.description,
      notes: values.notes,
      categoryId: values.categoryId,
      amountCents: values.amount,
      period: values.period,
      dueDate: values.dueDate,
      settledAt: values.settledAt,
    });

  return (
    <form noValidate className="grid gap-4" onSubmit={(event) => void handleSubmit(save)(event)}>
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <SegmentedControl
            label="Tipo"
            options={typeOptions}
            value={field.value}
            onChange={(value) => {
              field.onChange(value);
              // The category belongs to one type: changing the type asks for a new one.
              setValue('categoryId', '');
            }}
          />
        )}
      />
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
      {/* One column on the phone, two from sm. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={id('amount')} label="Valor (R$)" error={formState.errors.amount?.message}>
          <Input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            className="tabular-nums"
            {...register('amount')}
          />
        </FormField>
        <FormField id={id('period')} label="Competência" error={formState.errors.period?.message}>
          <Input type="month" {...register('period')} />
        </FormField>
        <FormField
          id={id('due-date')}
          label="Vencimento (opcional)"
          error={formState.errors.dueDate?.message}
        >
          <Input type="date" {...register('dueDate')} />
        </FormField>
        <FormField
          id={id('settled-at')}
          label="Efetivado em (opcional)"
          error={formState.errors.settledAt?.message}
        >
          <Input type="date" {...register('settledAt')} />
        </FormField>
      </div>
      <FormField
        id={id('notes')}
        label="Observações (opcional)"
        error={formState.errors.notes?.message}
      >
        <Input autoComplete="off" {...register('notes')} />
      </FormField>
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit">Salvar na prévia</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
