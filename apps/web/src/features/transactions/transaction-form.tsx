import {
  createTransactionInputSchema,
  isoDateSchema,
  reaisInputSchema,
  type Category,
  type Transaction,
  type TransactionType,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const typeLabels: Record<TransactionType, string> = { DEBIT: 'Débito', CREDIT: 'Crédito' };

function isTransactionType(value: string): value is TransactionType {
  return value === 'DEBIT' || value === 'CREDIT';
}

/** The category picker; FormField hands it the id and error wiring for its trigger. */
function CategorySelect({
  id,
  value,
  onChange,
  options,
  ...aria
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Category[];
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  return (
    // An empty value shows the placeholder (Radix items never use '').
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" {...aria}>
        <SelectValue placeholder="Escolha…" />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            {category.archived ? `${category.name} (arquivada)` : category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
      className="grid gap-4"
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      {/* Two large segments instead of small radio dots: 44px targets on the phone. */}
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <RadioGroupPrimitive.Root
            aria-label="Tipo"
            value={field.value}
            onValueChange={(value) => {
              if (!isTransactionType(value)) return;
              field.onChange(value);
              // The category belongs to one type: changing the type asks for a new one.
              setValue('categoryId', '');
            }}
            className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1"
          >
            {(['DEBIT', 'CREDIT'] as const).map((value) => (
              <RadioGroupPrimitive.Item
                key={value}
                value={value}
                className="text-muted-foreground focus-visible:ring-ring/50 data-[state=checked]:bg-background data-[state=checked]:text-foreground h-11 rounded-md font-medium outline-none focus-visible:ring-3 data-[state=checked]:shadow-sm md:h-8"
              >
                {typeLabels[value]}
              </RadioGroupPrimitive.Item>
            ))}
          </RadioGroupPrimitive.Root>
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
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
