import {
  createTransactionInputSchema,
  formatCents,
  installmentCountSchema,
  parseReais,
  splitInstallments,
  isoDateSchema,
  reaisInputSchema,
  type Category,
  type Transaction,
  type TransactionType,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
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
    /**
     * Only when creating: once, every month from this competência on, or in installments
     * (ADR 0038).
     */
    repeat: z.enum(['NONE', 'MONTHLY', 'INSTALLMENTS']),
    /** Of a monthly one: the same every month, or changing (energy, water), ADR 0038. */
    amountKind: z.enum(['FIXED', 'VARIABLE']),
    /** Of installments: how many, as typed. */
    installments: z.string(),
    /** Of installments: whether the amount typed is the whole purchase or each installment. */
    amountIs: z.enum(['TOTAL', 'INSTALLMENT']),
  })
  .superRefine((values, ctx) => {
    if (values.repeat !== 'INSTALLMENTS') return;
    const count = installmentCountSchema.safeParse(Number(values.installments));
    if (!count.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['installments'],
        message: count.error.issues[0]?.message ?? 'Informe o número de parcelas.',
      });
    }
  });

type FormInput = z.input<typeof transactionFormSchema>;
export type TransactionFormValues = z.output<typeof transactionFormSchema>;

/** 15990 → "159,90": the amount as the person would type it. */
const amountText = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });

const typeOptions: readonly { value: TransactionType; label: string }[] = [
  { value: 'DEBIT', label: 'Débito' },
  { value: 'CREDIT', label: 'Crédito' },
];

const amountKindOptions = [
  { value: 'FIXED', label: 'Fixo' },
  { value: 'VARIABLE', label: 'Variável' },
] as const;

const repeatOptions = [
  { value: 'NONE', label: 'Não repetir' },
  { value: 'MONTHLY', label: 'Todo mês' },
  { value: 'INSTALLMENTS', label: 'Parcelado' },
] as const;

const amountIsOptions = [
  { value: 'TOTAL', label: 'Total' },
  { value: 'INSTALLMENT', label: 'Da parcela' },
] as const;

/**
 * "10 parcelas de R$ 35,00, total R$ 350,00", or, when cents are left over, "3 parcelas:
 * 2 de R$ 333,33 e a última de R$ 333,34": what will be created, before it is.
 */
function installmentsPreview(
  amountText: string,
  countText: string,
  amountIs: 'TOTAL' | 'INSTALLMENT',
) {
  const cents = parseReais(amountText);
  const count = installmentCountSchema.safeParse(Number(countText));
  if (cents === null || cents <= 0 || !count.success) return null;
  const total = amountIs === 'TOTAL' ? cents : cents * count.data;
  if (amountIs === 'TOTAL' && total < count.data) return null;
  const parts = splitInstallments(total, count.data);
  const first = parts[0] ?? 0;
  const last = parts.at(-1) ?? 0;
  if (first === last) {
    return `${count.data} parcelas de ${formatCents(first)}, total ${formatCents(total)}.`;
  }
  return `${count.data} parcelas: ${count.data - 1} de ${formatCents(first)} e a última de ${formatCents(last)}, total ${formatCents(total)}.`;
}

/** The category picker; FormField hands it the id and error wiring for its trigger. */
export function CategorySelect({
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
  allowRepeat = false,
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
  /** Offers "Repetir": only for a new transaction. */
  allowRepeat?: boolean;
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
      repeat: 'NONE',
      amountKind: 'FIXED',
      installments: '',
      amountIs: 'TOTAL',
    },
  });
  // useWatch rather than watch(): the hook form is safe for the React Compiler.
  const type = useWatch({ control, name: 'type' });
  const repeat = useWatch({ control, name: 'repeat' });
  const amountKind = useWatch({ control, name: 'amountKind' });
  const amountIs = useWatch({ control, name: 'amountIs' });
  const typedAmount = useWatch({ control, name: 'amount' });
  const typedInstallments = useWatch({ control, name: 'installments' });
  const variable = repeat === 'MONTHLY' && amountKind === 'VARIABLE';
  const installments = repeat === 'INSTALLMENTS';
  const amountLabel = variable
    ? 'Valor estimado (R$)'
    : installments
      ? amountIs === 'TOTAL'
        ? 'Valor total (R$)'
        : 'Valor da parcela (R$)'
      : 'Valor (R$)';
  const preview = installments
    ? installmentsPreview(typedAmount ?? '', typedInstallments ?? '', amountIs ?? 'TOTAL')
    : null;
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
        <FormField id={id('amount')} label={amountLabel} error={formState.errors.amount?.message}>
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
      {allowRepeat && (
        <div className="grid gap-2">
          <p aria-hidden className="text-sm font-medium">
            Repetir
          </p>
          <Controller
            control={control}
            name="repeat"
            render={({ field }) => (
              <SegmentedControl
                label="Repetir"
                options={repeatOptions}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          {repeat === 'MONTHLY' && (
            <p className="text-muted-foreground text-sm">
              Um lançamento pendente em cada mês, a partir deste, no mesmo dia de vencimento. Para
              parar, use "Encerrar recorrência" no menu do lançamento.
            </p>
          )}
        </div>
      )}
      {allowRepeat && repeat === 'MONTHLY' && (
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
          <p className="text-muted-foreground text-sm">
            {variable
              ? 'Para contas que mudam todo mês, como energia e água. Cada mês começa com a média dos 3 últimos pagos; ao efetivar, você informa o valor da fatura.'
              : 'O mesmo valor todo mês, como internet e aluguel.'}
          </p>
        </div>
      )}
      {allowRepeat && installments && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id={id('installments')}
            label="Parcelas"
            error={formState.errors.installments?.message}
          >
            <Input
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ex.: 10"
              className="tabular-nums"
              {...register('installments')}
            />
          </FormField>
          <div className="grid gap-2">
            <p aria-hidden className="text-sm font-medium">
              O valor digitado é
            </p>
            <Controller
              control={control}
              name="amountIs"
              render={({ field }) => (
                <SegmentedControl
                  label="O valor digitado é"
                  options={amountIsOptions}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
          <p aria-live="polite" className="text-muted-foreground text-sm sm:col-span-2">
            {preview ??
              'Uma parcela por mês, a partir deste, todas pendentes. Com o total, os centavos que sobram vão para a última.'}
          </p>
        </div>
      )}
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
