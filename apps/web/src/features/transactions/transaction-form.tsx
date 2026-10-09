import {
  plainTransactionInputSchema,
  formatCents,
  installmentCountSchema,
  parseReais,
  splitInstallments,
  isoDateSchema,
  PERSON_NAME_MAX_LENGTH,
  reaisInputSchema,
  type Category,
  type Person,
  type Transaction,
  type TransactionType,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { CategorySelect } from '@/features/categories/category-picker';
import { apiErrorMessage } from '@/lib/error-message';
import { shareCents } from './split';
import { SplitFields, type SplitFormFields } from './split-fields';

/**
 * What the form edits: the shared rules for description and notes, plus the fields typed as
 * text (amount in reais, optional due date) turned into what the API takes.
 */
const transactionFormSchema = plainTransactionInputSchema
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
    /** A receber de / a pagar para (ADR 0042): a name; a new one becomes a person on save. */
    person: z
      .string()
      .trim()
      .max(PERSON_NAME_MAX_LENGTH, `Use no máximo ${PERSON_NAME_MAX_LENGTH} caracteres.`),
    /** Only when creating a debit: "Dividir com alguém" (ADR 0042). */
    splitOn: z.boolean(),
    shareMode: z.enum(['REAIS', 'PERCENT']),
    shares: z.array(z.object({ name: z.string(), value: z.string() })),
  })
  .superRefine((values, ctx) => {
    if (values.splitOn && values.type === 'DEBIT' && values.repeat === 'NONE') {
      const seen = new Set<string>();
      let others = 0;
      values.shares.forEach((share, index) => {
        const name = share.name.trim().toLocaleLowerCase('pt-BR');
        if (!name) {
          ctx.addIssue({
            code: 'custom',
            path: ['shares', index, 'name'],
            message: 'Informe o nome.',
          });
        } else if (seen.has(name)) {
          ctx.addIssue({
            code: 'custom',
            path: ['shares', index, 'name'],
            message: 'Esta pessoa já está na divisão.',
          });
        }
        seen.add(name);
        const cents = shareCents(values.amount, share.value, values.shareMode);
        if (cents === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['shares', index, 'value'],
            message: values.shareMode === 'REAIS' ? 'Informe o valor.' : 'De 0 a 100%.',
          });
        }
        others += cents ?? 0;
      });
      if (others > values.amount) {
        ctx.addIssue({
          code: 'custom',
          path: ['shares'],
          message: 'As partes dos outros passam do valor do lançamento.',
        });
      }
    }
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

/** Values a new transaction starts from, e.g. an application to a budget destination. */
export type TransactionPreset = {
  type: TransactionType;
  categoryId: string;
  description: string;
  /** null leaves the amount empty. */
  amountCents: number | null;
};

export function TransactionForm({
  idPrefix,
  categories,
  people = [],
  initial,
  preset,
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
  /** The workspace's people, suggested in the "Pessoa" and "Dividir" fields (ADR 0042). */
  people?: Person[];
  initial?: Transaction;
  /** For a new transaction: what it starts with. Ignored when editing. */
  preset?: TransactionPreset;
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
      type: initial?.type ?? preset?.type ?? 'DEBIT',
      description: initial?.description ?? preset?.description ?? '',
      notes: initial?.notes ?? '',
      categoryId: initial?.categoryId ?? preset?.categoryId ?? '',
      amount: initial
        ? amountText.format(initial.amountCents / 100)
        : preset?.amountCents
          ? amountText.format(preset.amountCents / 100)
          : '',
      dueDate: initial?.dueDate ?? '',
      repeat: 'NONE',
      amountKind: 'FIXED',
      installments: '',
      amountIs: 'TOTAL',
      person: people.find((person) => person.id === initial?.personId)?.name ?? '',
      splitOn: false,
      shareMode: 'REAIS',
      shares: [{ name: '', value: '' }],
    },
  });
  // useWatch rather than watch(): the hook form is safe for the React Compiler.
  const type = useWatch({ control, name: 'type' });
  const repeat = useWatch({ control, name: 'repeat' });
  const amountKind = useWatch({ control, name: 'amountKind' });
  const amountIs = useWatch({ control, name: 'amountIs' });
  const typedAmount = useWatch({ control, name: 'amount' });
  const typedInstallments = useWatch({ control, name: 'installments' });
  const splitOn = useWatch({ control, name: 'splitOn' });
  // Splitting is for a new debit launched once; the rest may name one person (ADR 0042).
  const canSplit = allowRepeat && type === 'DEBIT' && repeat === 'NONE';
  const splitting = canSplit && splitOn;
  const showPerson = (!allowRepeat || repeat === 'NONE') && !splitting;
  const peopleListId = `${idPrefix}-people`;
  const totalCents = (() => {
    const cents = parseReais(typedAmount ?? '');
    return cents !== null && cents > 0 ? cents : null;
  })();
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
      {/* The names already listed, suggested as the person types (a new one becomes a person). */}
      <datalist id={peopleListId}>
        {people
          .filter((person) => !person.archived)
          .map((person) => (
            <option key={person.id} value={person.name} />
          ))}
      </datalist>
      {showPerson && (
        <FormField
          id={id('person')}
          label={type === 'CREDIT' ? 'A receber de (opcional)' : 'A pagar para (opcional)'}
          error={formState.errors.person?.message}
        >
          <Input list={peopleListId} autoComplete="off" {...register('person')} />
        </FormField>
      )}
      {canSplit && (
        <div className="grid gap-3">
          <Controller
            control={control}
            name="splitOn"
            render={({ field }) => (
              <div className="flex items-center gap-1">
                {/* A 44px target on the phone (ADR 0036), pulled left to line up with the fields. */}
                <label
                  htmlFor={id('split')}
                  className="-ml-3.5 flex size-11 shrink-0 cursor-pointer items-center justify-center md:-ml-1 md:size-6"
                >
                  <Checkbox
                    id={id('split')}
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                </label>
                <label htmlFor={id('split')} className="cursor-pointer text-sm font-medium">
                  Dividir com alguém
                </label>
              </div>
            )}
          />
          {splitting && (
            <SplitFields
              idPrefix={idPrefix}
              // The split fields are a slice of this form; their names match it.
              control={control as unknown as Control<SplitFormFields>}
              register={register}
              setValue={setValue as never}
              errors={formState.errors}
              totalCents={totalCents}
              peopleListId={peopleListId}
            />
          )}
        </div>
      )}
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
