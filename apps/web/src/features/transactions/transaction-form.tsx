import {
  createTransactionInputSchema,
  isoDateSchema,
  reaisInputSchema,
  type Category,
  type Transaction,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/error-message';

/**
 * What the form edits: the shared rules for description and notes, plus the fields typed as
 * text (amount in reais, optional due date) turned into what the API takes.
 */
const transactionFormSchema = createTransactionInputSchema
  .pick({ type: true, description: true, notes: true })
  .extend({
    categoryId: z.string().min(1, 'Escolha uma categoria.'),
    amount: reaisInputSchema,
    dueDate: z
      .string()
      .transform((date) => date || null)
      .pipe(isoDateSchema.nullable()),
  });

type FormInput = z.input<typeof transactionFormSchema>;
export type TransactionFormValues = z.output<typeof transactionFormSchema>;

/** 15990 → "159,90": the amount as the person would type it. */
const amountText = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });

// Same box as Input (44px below md) until the shadcn Select replaces it (ADR 0036).
const selectClassName =
  'border-input h-11 w-full rounded-lg border bg-transparent px-3 text-base md:h-8 md:px-2.5 md:text-sm';

export function TransactionForm({
  idPrefix,
  categories,
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  /** Keeps the field ids unique when several forms are on the page. */
  idPrefix: string;
  categories: Category[];
  initial?: Transaction;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  /** To start over after creating, the page remounts the form with a new `key`. */
  onSubmit: (values: TransactionFormValues) => void;
  onCancel?: () => void;
}) {
  const { register, handleSubmit, formState, control, setValue } = useForm<
    FormInput,
    unknown,
    TransactionFormValues
  >({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      type: initial?.type ?? 'DEBIT',
      description: initial?.description ?? '',
      notes: initial?.notes ?? '',
      categoryId: initial?.categoryId ?? '',
      amount: initial ? amountText.format(initial.amountCents / 100) : '',
      dueDate: initial?.dueDate ?? '',
    },
  });
  // useWatch rather than watch(): the hook form is safe for the React Compiler.
  const type = useWatch({ control, name: 'type' });
  // Only categories of the chosen type; an archived one only if it is already the current one.
  const options = categories.filter(
    (category) =>
      category.type === type && (!category.archived || category.id === initial?.categoryId),
  );
  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <fieldset className="flex gap-4">
        <legend className="sr-only">Tipo</legend>
        {(['DEBIT', 'CREDIT'] as const).map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              value={value}
              // The category belongs to one type: changing the type asks for a new one.
              {...register('type', { onChange: () => setValue('categoryId', '') })}
            />
            {value === 'DEBIT' ? 'Débito' : 'Crédito'}
          </label>
        ))}
      </fieldset>
      <FormField
        id={id('description')}
        label="Descrição"
        error={formState.errors.description?.message}
      >
        <Input autoComplete="off" {...register('description')} />
      </FormField>
      <FormField id={id('category')} label="Categoria" error={formState.errors.categoryId?.message}>
        <select className={selectClassName} {...register('categoryId')}>
          <option value="">Escolha…</option>
          {options.map((category) => (
            <option key={category.id} value={category.id}>
              {category.archived ? `${category.name} (arquivada)` : category.name}
            </option>
          ))}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id={id('amount')} label="Valor (R$)" error={formState.errors.amount?.message}>
          <Input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            {...register('amount')}
          />
        </FormField>
        <FormField
          id={id('due-date')}
          label="Vencimento (opcional)"
          error={formState.errors.dueDate?.message}
        >
          <Input type="date" {...register('dueDate')} />
        </FormField>
      </div>
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
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
