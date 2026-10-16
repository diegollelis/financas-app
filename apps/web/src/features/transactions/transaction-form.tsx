import {
  plainTransactionInputSchema,
  formatCents,
  installmentCountSchema,
  MAX_DUE_MONTH_OFFSET,
  parseReais,
  splitInstallments,
  isoDateSchema,
  PERSON_NAME_MAX_LENGTH,
  reaisInputSchema,
  MERCHANT_NAME_MAX_LENGTH,
  paymentMethodFieldLabels,
  paymentMethodSchema,
  suggestCategory,
  suggestPaymentMethod,
  type Category,
  type CategoryHints,
  type Merchant,
  type Person,
  type Transaction,
  transactionTypeLabels,
  type TransactionType,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/features/auth/use-me';
import { CategorySelect } from '@/features/categories/category-picker';
import { MerchantSelect } from '@/features/merchants/merchant-picker';
import { findMerchant } from '@/features/merchants/use-merchants';
import { PersonSelect } from '@/features/people/person-picker';
import { amountKindHint, dueDayLabel, dueOf, monthNameOf } from '@/features/recurrences/due';
import { apiErrorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import { shareCents } from './split';
import { PaymentMethodSelect } from './payment-method-select';
import { SplitFields, type SplitFormFields } from './split-fields';

/**
 * What the form edits: the shared rules for description and notes, plus the fields typed as
 * text (amount in reais, optional due date) turned into what the API takes.
 */
const transactionFormSchema = plainTransactionInputSchema
  .pick({ type: true, description: true, notes: true })
  .extend({
    categoryId: z.string().min(1, 'Escolha uma categoria.'),
    /** The category the history filled in (ADR 0053); '' when none. Never sent. */
    suggestedCategoryId: z.string(),
    amount: reaisInputSchema,
    dueDate: z
      .string()
      .transform((date) => date || null)
      .pipe(isoDateSchema.nullable()),
    /** The competência it is launched in: how far a repeated one's due date may fall. Never sent. */
    period: z.string(),
    /**
     * Only when creating: once, every month from this competência on, or in installments
     * (ADR 0038).
     */
    repeat: z.enum(['NONE', 'MONTHLY', 'YEARLY', 'INSTALLMENTS']),
    /** Of a monthly one: the same every month, or changing (energy, water), ADR 0038. */
    amountKind: z.enum(['FIXED', 'VARIABLE']),
    /** Of installments: how many, as typed. */
    installments: z.string(),
    /** Of installments: whether the amount typed is the whole purchase or each installment. */
    amountIs: z.enum(['TOTAL', 'INSTALLMENT']),
    /** Where it was bought or who paid it (ADR 0053): a name; a new one is created on save. */
    merchant: z
      .string()
      .trim()
      .max(MERCHANT_NAME_MAX_LENGTH, `Use no máximo ${MERCHANT_NAME_MAX_LENGTH} caracteres.`),
    /** How it was paid or received (ADR 0054); '' for none. */
    paymentMethod: z.union([z.literal(''), paymentMethodSchema]),
    /** The method the history filled in (ADR 0054); '' when none. Never sent. */
    suggestedPaymentMethod: z.string(),
    /** A receber de / a pagar para (ADR 0042): a name; a new one becomes a person on save. */
    person: z
      .string()
      .trim()
      .max(PERSON_NAME_MAX_LENGTH, `Use no máximo ${PERSON_NAME_MAX_LENGTH} caracteres.`),
    /** Only when creating: "Dividir com alguém" (ADRs 0042, 0052). */
    splitOn: z.boolean(),
    shareMode: z.enum(['REAIS', 'PERCENT']),
    shares: z.array(z.object({ name: z.string(), value: z.string() })),
  })
  .superRefine((values, ctx) => {
    if (values.splitOn) {
      // A share of an installment plan's total is divided among its installments (ADR 0052).
      const installments =
        values.repeat === 'INSTALLMENTS' && values.amountIs === 'TOTAL'
          ? Number(values.installments)
          : 0;
      if (values.shares.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['shares'], message: 'Escolha com quem dividir.' });
      }
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
        } else if (cents < installments) {
          ctx.addIssue({
            code: 'custom',
            path: ['shares', index, 'value'],
            message: 'Precisa dar ao menos um centavo por parcela.',
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
    // Every month is due as far from its competência as the first: the same month or the next.
    if (values.repeat !== 'NONE' && values.period) {
      const { dueMonthOffset } = dueOf(values.period, values.dueDate);
      if (dueMonthOffset < 0 || dueMonthOffset > MAX_DUE_MONTH_OFFSET) {
        ctx.addIssue({
          code: 'custom',
          path: ['dueDate'],
          message:
            'Numa recorrência ou num parcelamento, o vencimento fica no mês do lançamento ou no seguinte.',
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
  { value: 'DEBIT', label: transactionTypeLabels.DEBIT.singular },
  { value: 'CREDIT', label: transactionTypeLabels.CREDIT.singular },
];

const amountKindOptions = [
  { value: 'FIXED', label: 'Fixo' },
  { value: 'VARIABLE', label: 'Variável' },
] as const;

const repeatOptions = [
  { value: 'NONE', label: 'Não repetir' },
  { value: 'MONTHLY', label: 'Todo mês' },
  { value: 'YEARLY', label: 'Todo ano' },
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
  /**
   * An application to this saving destination (ADR 0047): the type and the category are fixed,
   * or it would quietly stop being one; no person, no split, no installments.
   */
  applicationTo?: string;
};

export function TransactionForm({
  idPrefix,
  categories,
  people = [],
  merchants = [],
  hints,
  initial,
  preset,
  period,
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
  /** The workspace's merchants, offered in "Estabelecimento" (ADR 0053). */
  merchants?: Merchant[];
  /** The history's categories (ADR 0053): a new transaction's empty category is filled from it. */
  hints?: CategoryHints;
  initial?: Transaction;
  /** For a new transaction: what it starts with. Ignored when editing. */
  preset?: TransactionPreset;
  /** The competência a new one is launched in, for the due date of a repeated one. */
  period?: string;
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
      suggestedCategoryId: '',
      amount: initial
        ? amountText.format(initial.amountCents / 100)
        : preset?.amountCents
          ? amountText.format(preset.amountCents / 100)
          : '',
      dueDate: initial?.dueDate ?? '',
      period: initial?.period ?? period ?? '',
      repeat: 'NONE',
      amountKind: 'FIXED',
      installments: '',
      amountIs: 'TOTAL',
      merchant: merchants.find((merchant) => merchant.id === initial?.merchantId)?.name ?? '',
      paymentMethod: initial?.paymentMethod ?? '',
      suggestedPaymentMethod: '',
      person: people.find((person) => person.id === initial?.personId)?.name ?? '',
      splitOn: false,
      shareMode: 'REAIS',
      shares: [],
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
  const typedDueDate = useWatch({ control, name: 'dueDate' });
  // A new transaction, a credit too, launched once, every month or in installments, may be
  // split; anything else may name one person, copied to each month (ADRs 0042, 0052).
  const canSplit = allowRepeat;
  const splitting = canSplit && splitOn;
  const showPerson = !splitting;
  const user = useCurrentUser();
  const totalCents = (() => {
    const cents = parseReais(typedAmount ?? '');
    return cents !== null && cents > 0 ? cents : null;
  })();
  // Every month or every year (ADR 0038 note): the same fields, only the cycle differs.
  const recurring = repeat === 'MONTHLY' || repeat === 'YEARLY';
  const yearly = repeat === 'YEARLY';
  const variable = recurring && amountKind === 'VARIABLE';
  const installments = repeat === 'INSTALLMENTS';
  const amountLabel = variable
    ? 'Valor estimado (R$)'
    : installments
      ? amountIs === 'TOTAL'
        ? 'Valor total (R$)'
        : 'Valor da parcela (R$)'
      : 'Valor (R$)';
  // When each month or installment is due, said as the date is typed (ADR 0038 note).
  const due = dueOf(period ?? '', isoDateSchema.safeParse(typedDueDate).data ?? null);
  const dueNote =
    repeat !== 'NONE' &&
    period &&
    due.dueDay !== null &&
    due.dueMonthOffset >= 0 &&
    due.dueMonthOffset <= MAX_DUE_MONTH_OFFSET
      ? `${installments ? 'Cada parcela' : yearly ? 'Cada ano' : 'Cada mês'} vence no ${dueDayLabel(due.dueDay, due.dueMonthOffset)}.`
      : null;
  const preview = installments
    ? installmentsPreview(typedAmount ?? '', typedInstallments ?? '', amountIs ?? 'TOTAL')
    : null;
  // Only categories of the chosen type; an archived one only if it is already the current one.
  const options = categories.filter(
    (category) =>
      category.type === type && (!category.archived || category.id === initial?.categoryId),
  );
  const id = (field: string) => `${idPrefix}-${field}`;
  // The category of the history (ADR 0053), for a new transaction: the merchant's, else the
  // description's. It fills an empty category, or replaces one it filled itself; a category the
  // person picked is never changed.
  const description = useWatch({ control, name: 'description' });
  const merchantName = useWatch({ control, name: 'merchant' });
  const categoryId = useWatch({ control, name: 'categoryId' });
  const suggested = useWatch({ control, name: 'suggestedCategoryId' });
  const suggestion =
    hints && !initial && !preset
      ? suggestCategory(hints, {
          type,
          description: description ?? '',
          merchantId: findMerchant(merchants, merchantName ?? '')?.id ?? null,
        })
      : null;
  const usable = options.some((category) => category.id === suggestion && !category.archived)
    ? suggestion
    : null;
  useEffect(() => {
    if (!usable || usable === categoryId) return;
    if (categoryId === '' || categoryId === suggested) {
      setValue('categoryId', usable, { shouldValidate: categoryId !== '' });
      setValue('suggestedCategoryId', usable);
    }
  }, [usable, categoryId, suggested, setValue]);
  // The payment method the same way (ADR 0054): fills an empty one, or replaces one it filled
  // itself; a method the person picked is never changed.
  const paymentMethod = useWatch({ control, name: 'paymentMethod' });
  const suggestedMethod = useWatch({ control, name: 'suggestedPaymentMethod' });
  const methodSuggestion =
    hints && !initial && !preset
      ? suggestPaymentMethod(hints, {
          type,
          description: description ?? '',
          merchantId: findMerchant(merchants, merchantName ?? '')?.id ?? null,
        })
      : null;
  useEffect(() => {
    if (!methodSuggestion || methodSuggestion === paymentMethod) return;
    if (paymentMethod === '' || paymentMethod === suggestedMethod) {
      setValue('paymentMethod', methodSuggestion);
      setValue('suggestedPaymentMethod', methodSuggestion);
    }
  }, [methodSuggestion, paymentMethod, suggestedMethod, setValue]);
  // Opened from the start when the transaction being edited uses one of them.
  const [moreOpen, setMoreOpen] = useState(
    Boolean(initial?.notes || initial?.personId || initial?.merchantId),
  );
  const application = initial ? undefined : preset?.applicationTo;
  // What "Mais opções" holds, named on it so nothing is hidden by surprise.
  const moreContents = [
    'observações',
    !application && 'estabelecimento',
    showPerson && !application && 'pessoa',
    canSplit && !application && 'dividir',
  ]
    .filter(Boolean)
    .join(', ');
  const fixedCategory = application
    ? (categories.find((category) => category.id === preset?.categoryId)?.name ?? application)
    : null;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) =>
        void handleSubmit(onSubmit, (errors) => {
          // A mistake in a folded field must be seen.
          if (errors.notes || errors.merchant || errors.person || errors.shares) setMoreOpen(true);
        })(event)
      }
    >
      {fixedCategory !== null ? (
        <p className="text-muted-foreground text-sm">
          Será lançada uma saída na categoria{' '}
          <span className="text-foreground font-medium">{fixedCategory}</span>. Nenhum dinheiro é
          movido: é só o registro do que você guardou.
        </p>
      ) : (
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
      )}
      {/* From lg, in the wider dialog, the short fields that go together share a row: what it is
          and its category; how much, when and how. The order stays the one of the phone. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <FormField
          id={id('description')}
          label="Descrição"
          error={formState.errors.description?.message}
        >
          <Input autoComplete="off" {...register('description')} />
        </FormField>
        {fixedCategory === null && (
          <Controller
            control={control}
            name="categoryId"
            render={({ field, fieldState }) => (
              <div className="grid gap-1">
                <FormField id={id('category')} label="Categoria" error={fieldState.error?.message}>
                  <CategorySelect
                    value={field.value}
                    onChange={field.onChange}
                    options={options}
                    allowAdd
                  />
                </FormField>
                {/* Says why it is filled in; gone once the person picks one (ADR 0053). */}
                {field.value !== '' && field.value === suggested && (
                  <p className="text-muted-foreground text-sm">Sugerida pelo histórico.</p>
                )}
              </div>
            )}
          />
        )}
      </div>
      {/* One column on the phone, two from sm, three from lg (the method, with the longest label, a little wider). */}
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr]">
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
        {/* Right after the due date, not in "Mais opções": the history's suggestion is seen (ADR 0054). */}
        <Controller
          control={control}
          name="paymentMethod"
          render={({ field, fieldState }) => (
            <div className="grid gap-1 sm:col-span-2 lg:col-span-1">
              <FormField
                id={id('payment-method')}
                label={`${paymentMethodFieldLabels[type]} (opcional)`}
                error={fieldState.error?.message}
              >
                <PaymentMethodSelect value={field.value} onChange={field.onChange} />
              </FormField>
              {field.value !== '' && field.value === suggestedMethod && (
                <p className="text-muted-foreground text-sm">Sugerido pelo histórico.</p>
              )}
            </div>
          )}
        />
      </div>
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
                // An application repeats every month or every year: installments make no sense here.
                options={
                  application
                    ? repeatOptions.filter((option) => option.value !== 'INSTALLMENTS')
                    : repeatOptions
                }
                value={field.value}
                onChange={field.onChange}
                // Four options do not fit in 360px: two rows on the phone.
                className={
                  application
                    ? undefined
                    : 'grid-flow-row grid-cols-2 sm:grid-flow-col sm:grid-cols-none'
                }
              />
            )}
          />
          {recurring && (
            <p className="text-muted-foreground text-sm">
              {yearly
                ? `Um lançamento pendente todo ano em ${monthNameOf(period ?? '')}, a partir deste.`
                : 'Um lançamento pendente em cada mês, a partir deste.'}{' '}
              Para parar, use "Encerrar recorrência" no menu do lançamento.
            </p>
          )}
          {dueNote && <p className="text-muted-foreground text-sm">{dueNote}</p>}
        </div>
      )}
      {allowRepeat && recurring && (
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
          <p className="text-muted-foreground text-sm">{amountKindHint(variable, yearly)}</p>
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
      {/* The common path stays short (ADR 0036): notes, a person and a split wait in here. */}
      <details
        open={moreOpen}
        onToggle={(event) => setMoreOpen(event.currentTarget.open)}
        className="rounded-xl border px-4 py-2"
      >
        <summary className="cursor-pointer py-2 font-medium">
          Mais opções <span className="text-muted-foreground font-normal">({moreContents})</span>
        </summary>
        <div className="grid gap-4 pt-2 pb-3">
          <FormField
            id={id('notes')}
            label="Observações (opcional)"
            error={formState.errors.notes?.message}
          >
            <Input autoComplete="off" {...register('notes')} />
          </FormField>
          {/* Side by side from lg; the merchant takes the row when there is no person (a split). */}
          {!application && (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <div className={cn(!showPerson && 'lg:col-span-2')}>
                <Controller
                  control={control}
                  name="merchant"
                  render={({ field, fieldState }) => (
                    <FormField
                      id={id('merchant')}
                      label="Estabelecimento (opcional)"
                      error={fieldState.error?.message}
                    >
                      <MerchantSelect
                        value={field.value}
                        onChange={field.onChange}
                        merchants={merchants}
                      />
                    </FormField>
                  )}
                />
              </div>
              {showPerson && (
                <Controller
                  control={control}
                  name="person"
                  render={({ field, fieldState }) => (
                    <FormField
                      id={id('person')}
                      label={
                        type === 'CREDIT' ? 'A receber de (opcional)' : 'A pagar para (opcional)'
                      }
                      error={fieldState.error?.message}
                    >
                      <PersonSelect
                        value={field.value}
                        onChange={field.onChange}
                        people={people}
                        userId={user.id}
                        optional
                        title={type === 'CREDIT' ? 'A receber de' : 'A pagar para'}
                      />
                    </FormField>
                  )}
                />
              )}
            </div>
          )}
          {canSplit && !application && (
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
                  type={type}
                  people={people}
                  userId={user.id}
                  installments={
                    repeat === 'INSTALLMENTS'
                      ? { count: Number(typedInstallments), amountIs: amountIs ?? 'TOTAL' }
                      : undefined
                  }
                  monthly={recurring ? { variable, yearly } : undefined}
                />
              )}
            </div>
          )}
        </div>
      </details>
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
