import {
  recurrenceFieldsSchema,
  dueDaySchema,
  MERCHANT_NAME_MAX_LENGTH,
  normalizeName,
  paymentMethodFieldLabels,
  paymentMethodSchema,
  reaisInputSchema,
  type Category,
  type Merchant,
  type Person,
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
import { NotesTextarea } from '@/components/notes-textarea';
import { CategorySelect } from '@/features/categories/category-picker';
import { MerchantSelect } from '@/features/merchants/merchant-picker';
import { PersonSelect } from '@/features/people/person-picker';
import { PaymentMethodSelect } from '@/features/transactions/payment-method-select';
import { apiErrorMessage } from '@/lib/error-message';

/** What can change in a recurrence: not its type nor its start (ADR 0038). */
const recurrenceFormSchema = recurrenceFieldsSchema
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
    /** Due in the same month as each competência or in the next (ADR 0038 note). */
    dueMonth: z.enum(['SAME', 'NEXT']),
    /** How it is paid or received (ADR 0054); '' for none. */
    paymentMethod: z.union([z.literal(''), paymentMethodSchema]),
    /** Where it is bought or who pays it (ADR 0053): a name, resolved to a merchant on save. */
    merchant: z
      .string()
      .trim()
      .max(MERCHANT_NAME_MAX_LENGTH, `Use no máximo ${MERCHANT_NAME_MAX_LENGTH} caracteres.`),
    /** A receber de / a pagar para (ADR 0052): a name, resolved to a person on save. */
    person: z.string().trim(),
  });

type FormInput = z.input<typeof recurrenceFormSchema>;
type FormValues = z.output<typeof recurrenceFormSchema>;

const amountText = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });

const amountKindOptions = [
  { value: 'FIXED', label: 'Fixo' },
  { value: 'VARIABLE', label: 'Variável' },
] as const;

const dueMonthOptions = [
  { value: 'SAME', label: 'Mesmo mês' },
  { value: 'NEXT', label: 'Mês seguinte' },
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
  const dueMonthOffset = values.dueMonth === 'NEXT' ? 1 : 0;
  if (dueMonthOffset !== recurrence.dueMonthOffset) changes.dueMonthOffset = dueMonthOffset;
  const paymentMethod = values.paymentMethod || null;
  if (paymentMethod !== recurrence.paymentMethod) changes.paymentMethod = paymentMethod;
  const variableAmount = values.amountKind === 'VARIABLE';
  if (variableAmount !== recurrence.variableAmount) changes.variableAmount = variableAmount;
  return changes;
}

export function RecurrenceForm({
  recurrence,
  categories,
  people,
  merchants,
  userId,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  recurrence: Recurrence;
  categories: Category[];
  /** The workspace's people, for "A receber de" / "A pagar para". */
  people: Person[];
  /** The workspace's merchants, for "Estabelecimento" (ADR 0053). */
  merchants: Merchant[];
  /** The signed-in user, left out of the people offered. */
  userId: string;
  pending: boolean;
  error: unknown;
  /**
   * Only what changed; empty when nothing did. `person` and `merchant` are the names picked when
   * they changed ('' to unlink), undefined otherwise: a new name has to be created first.
   */
  onSubmit: (
    changes: UpdateRecurrenceInput,
    person: string | undefined,
    merchant: string | undefined,
  ) => void;
  onCancel: () => void;
}) {
  const currentPerson = people.find((person) => person.id === recurrence.personId)?.name ?? '';
  // Archived or not: the current one stays as it is unless another is picked.
  const currentMerchant =
    merchants.find((merchant) => merchant.id === recurrence.merchantId)?.name ?? '';
  const { register, handleSubmit, formState, control } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(recurrenceFormSchema),
    defaultValues: {
      description: recurrence.description,
      notes: recurrence.notes ?? '',
      categoryId: recurrence.categoryId,
      amount: amountText.format(recurrence.amountCents / 100),
      dueDay: recurrence.dueDay === null ? '' : String(recurrence.dueDay),
      amountKind: recurrence.variableAmount ? 'VARIABLE' : 'FIXED',
      dueMonth: recurrence.dueMonthOffset === 1 ? 'NEXT' : 'SAME',
      paymentMethod: recurrence.paymentMethod ?? '',
      person: currentPerson,
      merchant: currentMerchant,
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
        void handleSubmit((values) =>
          onSubmit(
            recurrenceChanges(recurrence, values),
            normalizeName(values.person) === normalizeName(currentPerson)
              ? undefined
              : values.person,
            normalizeName(values.merchant) === normalizeName(currentMerchant)
              ? undefined
              : values.merchant,
          ),
        )(event)
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
            <CategorySelect
              value={field.value}
              onChange={field.onChange}
              options={options}
              allowAdd
            />
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
      <div className="grid gap-2">
        <p aria-hidden className="text-sm font-medium">
          Vence no
        </p>
        <Controller
          control={control}
          name="dueMonth"
          render={({ field }) => (
            <SegmentedControl
              label="Vence no"
              options={dueMonthOptions}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      <Controller
        control={control}
        name="paymentMethod"
        render={({ field, fieldState }) => (
          <FormField
            id={id('payment-method')}
            label={`${paymentMethodFieldLabels[recurrence.type]} (opcional)`}
            error={fieldState.error?.message}
          >
            <PaymentMethodSelect value={field.value} onChange={field.onChange} />
          </FormField>
        )}
      />
      <p className="text-muted-foreground text-sm">
        {variable
          ? 'Um valor novo substitui as estimativas pendentes; os meses cujo valor já foi informado ficam como estão. Os meses seguintes começam pela média dos 3 últimos pagos.'
          : 'Num mês sem esse dia, o vencimento é o último dia do mês.'}
      </p>
      <Controller
        control={control}
        name="merchant"
        render={({ field, fieldState }) => (
          <FormField
            id={id('merchant')}
            label="Estabelecimento (opcional)"
            error={fieldState.error?.message}
          >
            <MerchantSelect value={field.value} onChange={field.onChange} merchants={merchants} />
          </FormField>
        )}
      />
      {recurrence.split.length > 0 ? (
        // Changing the split is not offered yet (ADR 0052): end it and create another.
        <p className="text-muted-foreground text-sm">
          A divisão não muda aqui. Para dividir de outro jeito, encerre esta recorrência e crie
          outra.
        </p>
      ) : (
        <Controller
          control={control}
          name="person"
          render={({ field, fieldState }) => (
            <FormField
              id={id('person')}
              label={
                recurrence.type === 'CREDIT' ? 'A receber de (opcional)' : 'A pagar para (opcional)'
              }
              error={fieldState.error?.message}
            >
              <PersonSelect
                value={field.value}
                onChange={field.onChange}
                people={people}
                userId={userId}
                optional
                title={recurrence.type === 'CREDIT' ? 'A receber de' : 'A pagar para'}
              />
            </FormField>
          )}
        />
      )}
      <FormField
        id={id('notes')}
        label="Observações (opcional)"
        error={formState.errors.notes?.message}
      >
        <NotesTextarea {...register('notes')} />
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
