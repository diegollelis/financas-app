import {
  isoDateSchema,
  MERCHANT_ALIAS_MAX_LENGTH,
  occurredOnLabels,
  MERCHANT_NAME_MAX_LENGTH,
  paymentMethodFieldLabels,
  paymentMethodSchema,
  PERSON_NAME_MAX_LENGTH,
  periodSchema,
  reaisInputSchema,
  transactionDescriptionSchema,
  transactionNotesSchema,
  transactionTypeSchema,
  type Category,
  type Merchant,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { CategorySelect } from '@/features/categories/category-picker';
import { MerchantSelect } from '@/features/merchants/merchant-picker';
import { PaymentMethodSelect } from '@/features/transactions/payment-method-select';
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
const rowFormSchema = (categoryRequired: boolean) =>
  z
    .object({
      type: transactionTypeSchema,
      description: transactionDescriptionSchema,
      // A statement's line may be saved for its merchant alone (ADR 0055 note): the category
      // is still asked on its card before the import.
      categoryId: categoryRequired ? z.string().min(1, 'Escolha uma categoria.') : z.string(),
      amount: reaisInputSchema,
      period: periodSchema,
      /** The day it happened (ADR 0055). */
      occurredOn: optionalDate,
      dueDate: optionalDate,
      settledAt: optionalDate,
      notes: transactionNotesSchema,
      /** A name; a new one becomes a merchant in the import (ADR 0053). */
      merchant: z
        .string()
        .trim()
        .max(MERCHANT_NAME_MAX_LENGTH, `Use no máximo ${MERCHANT_NAME_MAX_LENGTH} caracteres.`),
      /** A receber de / a pagar para, as a name (ADR 0040 note); a new one is created on import. */
      person: z
        .string()
        .trim()
        .max(PERSON_NAME_MAX_LENGTH, `Use no máximo ${PERSON_NAME_MAX_LENGTH} caracteres.`),
      /** '' = none (ADR 0054). */
      paymentMethod: z.union([z.literal(''), paymentMethodSchema]),
      /** A statement's line (ADR 0055): remember its text as an alias of the merchant chosen. */
      remember: z.boolean(),
      alias: z
        .string()
        .trim()
        .max(MERCHANT_ALIAS_MAX_LENGTH, `Use no máximo ${MERCHANT_ALIAS_MAX_LENGTH} caracteres.`),
    })
    .refine((values) => !values.remember || !values.merchant || values.alias !== '', {
      message: 'Informe o apelido, ou desmarque "Lembrar como apelido".',
      path: ['alias'],
    });

type FormInput = z.input<ReturnType<typeof rowFormSchema>>;
type FormValues = z.output<ReturnType<typeof rowFormSchema>>;

const amountText = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });

const typeOptions = [
  { value: 'DEBIT', label: 'Saída' },
  { value: 'CREDIT', label: 'Entrada' },
] as const;

/** " - Parcela 3/10" at the end: an alias is the part that does not change. */
const withoutInstallment = (title: string) =>
  title.replace(/\s*-?\s*parcela\s+\d+\s*\/\s*\d+\s*$/i, '').trim();

export function ImportRowForm({
  row,
  categories,
  merchants,
  pendingMerchants,
  sameLines,
  categoryId,
  onSave,
  onCancel,
}: {
  row: ReviewRow;
  categories: Category[];
  /** A statement's review picks the merchant from the workspace's (ADR 0055). */
  merchants?: Merchant[];
  /** The merchants added elsewhere in this review, created on import. */
  pendingMerchants?: readonly { name: string; aliases: readonly string[] }[];
  /** How many other lines of the statement take these choices, with the alias typed. */
  sameLines?: (alias: string | null) => number;
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
    resolver: zodResolver(rowFormSchema(!row.statementTitle)),
    defaultValues: {
      type: row.type ?? 'DEBIT',
      description: row.description,
      categoryId: categoryId ?? '',
      amount:
        row.amountCents && row.amountCents > 0 ? amountText.format(row.amountCents / 100) : '',
      period: row.period ?? '',
      occurredOn: row.occurredOn ?? '',
      dueDate: row.dueDate ?? '',
      settledAt: row.settledAt ?? '',
      notes: row.notes ?? '',
      merchant: row.merchantName,
      person: row.personName ?? '',
      paymentMethod: row.paymentMethod ?? '',
      // Learning an alias is the default on a statement's line without one (ADR 0055).
      remember:
        row.rememberAlias !== undefined && row.rememberAlias !== null ? true : !row.merchantByAlias,
      alias:
        row.rememberAlias ?? (row.statementTitle ? withoutInstallment(row.statementTitle) : ''),
    },
  });
  const merchantName = useWatch({ control, name: 'merchant' });
  const remember = useWatch({ control, name: 'remember' });
  const alias = useWatch({ control, name: 'alias' });
  // A statement's line whose merchant did not come from an alias may teach one.
  const offersAlias = Boolean(row.statementTitle) && !row.merchantByAlias;
  const type = useWatch({ control, name: 'type' });
  // The alias counts only while it is to be remembered for a merchant.
  const sameCount =
    sameLines?.(offersAlias && remember && merchantName ? alias || null : null) ?? 0;
  const options = categories.filter((category) => category.type === type && !category.archived);
  const id = (field: string) => `import-row-${row.line}-${field}`;
  // A merchant chosen for a line that had none names it, as the statement's review does (ADR
  // 0055 note), unless the description was typed here.
  const describedByMerchant = (values: FormValues) =>
    Boolean(row.statementTitle) &&
    !row.merchantName &&
    Boolean(values.merchant) &&
    values.description === row.description;
  const save = (values: FormValues) =>
    onSave({
      ...row,
      included: true,
      type: values.type,
      description: describedByMerchant(values) ? values.merchant : values.description,
      rememberAlias: offersAlias && values.remember && values.merchant ? values.alias : null,
      notes: values.notes,
      merchantName: values.merchant,
      personName: values.person,
      paymentMethod: values.paymentMethod || null,
      categoryId: values.categoryId || null,
      amountCents: values.amount,
      period: values.period,
      occurredOn: values.occurredOn,
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
            <CategorySelect
              value={field.value}
              onChange={field.onChange}
              options={options}
              allowAdd
            />
          </FormField>
        )}
      />
      {merchants ? (
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
                pending={pendingMerchants}
              />
            </FormField>
          )}
        />
      ) : (
        <FormField
          id={id('merchant')}
          label="Estabelecimento (opcional)"
          error={formState.errors.merchant?.message}
        >
          <Input autoComplete="off" {...register('merchant')} />
        </FormField>
      )}
      {/* The spreadsheet's "Pessoa" (ADR 0040 note); a statement's line has none. */}
      {!row.statementTitle && (
        <FormField
          id={id('person')}
          label={type === 'CREDIT' ? 'A receber de (opcional)' : 'A pagar para (opcional)'}
          error={formState.errors.person?.message}
        >
          <Input autoComplete="off" {...register('person')} />
        </FormField>
      )}
      {offersAlias && merchantName && (
        <div className="grid gap-3">
          <Controller
            control={control}
            name="remember"
            render={({ field }) => (
              <div className="flex items-center gap-1">
                {/* A 44px target on the phone (ADR 0036), pulled left to line up with the fields. */}
                <label
                  htmlFor={id('remember')}
                  className="-ml-3.5 flex size-11 shrink-0 cursor-pointer items-center justify-center md:-ml-1 md:size-6"
                >
                  <Checkbox
                    id={id('remember')}
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                </label>
                <label htmlFor={id('remember')} className="cursor-pointer text-sm font-medium">
                  Lembrar como apelido
                </label>
              </div>
            )}
          />
          {remember && (
            <FormField
              id={id('alias')}
              label="Apelido"
              hint={`Na próxima fatura, as linhas que começam com este texto já vêm com ${merchantName}. Encurte para a parte que não muda.`}
              error={formState.errors.alias?.message}
            >
              <Input autoComplete="off" {...register('alias')} />
            </FormField>
          )}
        </div>
      )}
      {sameCount > 0 && (
        <p className="text-muted-foreground text-sm">
          {sameCount === 1
            ? 'Mais 1 linha desta fatura, com o mesmo texto ou que começa com o apelido, recebe o mesmo estabelecimento e categoria, se ainda não tiver.'
            : `Mais ${sameCount} linhas desta fatura, com o mesmo texto ou que começam com o apelido, recebem o mesmo estabelecimento e categoria, se ainda não tiverem.`}
        </p>
      )}
      <Controller
        control={control}
        name="paymentMethod"
        render={({ field, fieldState }) => (
          <FormField
            id={id('payment-method')}
            label={`${paymentMethodFieldLabels[type]} (opcional)`}
            error={fieldState.error?.message}
          >
            <PaymentMethodSelect value={field.value} onChange={field.onChange} />
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
          id={id('period')}
          label="Mês de referência"
          error={formState.errors.period?.message}
        >
          <Input type="month" {...register('period')} />
        </FormField>
        <FormField
          id={id('occurred-on')}
          label={`${occurredOnLabels[type]} (opcional)`}
          error={formState.errors.occurredOn?.message}
        >
          <Input type="date" {...register('occurredOn')} />
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
          label="Pago ou recebido em (opcional)"
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
