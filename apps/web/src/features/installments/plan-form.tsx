import {
  dueDaySchema,
  installmentCountSchema,
  normalizeName,
  paymentMethodFieldLabels,
  paymentMethodSchema,
  reaisInputSchema,
  transactionDescriptionSchema,
  transactionNotesSchema,
  type Category,
  type InstallmentPlan,
  type Person,
  type UpdateInstallmentPlanInput,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CategorySelect } from '@/features/categories/category-picker';
import { PersonSelect } from '@/features/people/person-picker';
import { PaymentMethodSelect } from '@/features/transactions/payment-method-select';
import { apiErrorMessage } from '@/lib/error-message';

/** What can change in a running plan (ADR 0038 note): not its type, nor who shares it. */
const planFormSchema = z.object({
  description: transactionDescriptionSchema,
  notes: transactionNotesSchema,
  categoryId: z.string().min(1, 'Escolha uma categoria.'),
  /** The whole purchase, as typed; only while nothing is settled and it is not split. */
  amount: reaisInputSchema,
  installments: z
    .string()
    .trim()
    .transform((count) => Number(count))
    .pipe(installmentCountSchema),
  /** Typed as text; blank = no due date. */
  dueDay: z
    .string()
    .trim()
    .transform((day) => (day === '' ? null : Number(day)))
    .pipe(dueDaySchema.nullable()),
  dueMonth: z.enum(['SAME', 'NEXT']),
  paymentMethod: z.union([z.literal(''), paymentMethodSchema]),
  /** A receber de / a pagar para: a name, resolved to a person on save. */
  person: z.string().trim(),
});

type FormInput = z.input<typeof planFormSchema>;
type FormValues = z.output<typeof planFormSchema>;

const amountText = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });

const dueMonthOptions = [
  { value: 'SAME', label: 'Mesmo mês' },
  { value: 'NEXT', label: 'Mês seguinte' },
] as const;

/**
 * Only the fields that changed: each one sent reaches the pending installments, and an unchanged
 * one would undo an installment adjusted by hand. The amounts go together, as the whole purchase.
 */
function planChanges(plan: InstallmentPlan, values: FormValues, amountsLocked: boolean) {
  const changes: UpdateInstallmentPlanInput = {};
  if (values.description !== plan.description) changes.description = values.description;
  if ((values.notes || null) !== plan.notes) changes.notes = values.notes || null;
  if (values.categoryId !== plan.categoryId) changes.categoryId = values.categoryId;
  if (values.dueDay !== plan.dueDay) changes.dueDay = values.dueDay;
  const dueMonthOffset = values.dueMonth === 'NEXT' ? 1 : 0;
  if (dueMonthOffset !== plan.dueMonthOffset) changes.dueMonthOffset = dueMonthOffset;
  const paymentMethod = values.paymentMethod || null;
  if (paymentMethod !== plan.paymentMethod) changes.paymentMethod = paymentMethod;
  if (!amountsLocked) {
    if (values.amount !== plan.totalCents || values.installments !== plan.installments) {
      changes.amountCents = values.amount;
      changes.amountIs = 'TOTAL';
    }
    if (values.installments !== plan.installments) changes.installments = values.installments;
  }
  return changes;
}

export function PlanForm({
  plan,
  categories,
  people,
  userId,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  plan: InstallmentPlan;
  categories: Category[];
  people: Person[];
  userId: string;
  pending: boolean;
  error: unknown;
  /**
   * Only what changed; empty when nothing did. `person` is the name picked when it changed ('' to
   * unlink), undefined otherwise: a new name has to become a person first.
   */
  onSubmit: (changes: UpdateInstallmentPlanInput, person: string | undefined) => void;
  onCancel: () => void;
}) {
  const currentPerson = people.find((person) => person.id === plan.personId)?.name ?? '';
  // Paid installments are history, and a split's shares follow the amounts (ADR 0038 note).
  const amountsLocked = plan.settledCount > 0 || plan.isSplit;
  const { register, handleSubmit, formState, control } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      description: plan.description,
      notes: plan.notes ?? '',
      categoryId: plan.categoryId,
      amount: amountText.format(plan.totalCents / 100),
      installments: String(plan.installments),
      dueDay: plan.dueDay === null ? '' : String(plan.dueDay),
      dueMonth: plan.dueMonthOffset === 1 ? 'NEXT' : 'SAME',
      paymentMethod: plan.paymentMethod ?? '',
      person: currentPerson,
    },
  });
  // Only categories of its type; an archived one only if it is already the current one.
  const options = categories.filter(
    (category) =>
      category.type === plan.type && (!category.archived || category.id === plan.categoryId),
  );
  const id = (field: string) => `plan-${plan.id}-${field}`;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) =>
        void handleSubmit((values) =>
          onSubmit(
            planChanges(plan, values, amountsLocked),
            normalizeName(values.person) === normalizeName(currentPerson)
              ? undefined
              : values.person,
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
      {/* One column on the phone, two from sm. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={id('amount')}
          label="Valor total (R$)"
          error={formState.errors.amount?.message}
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            // Read-only, not disabled: a disabled field has no value for the form to validate.
            readOnly={amountsLocked}
            className={
              amountsLocked ? 'bg-muted text-muted-foreground tabular-nums' : 'tabular-nums'
            }
            {...register('amount')}
          />
        </FormField>
        <FormField
          id={id('installments')}
          label="Parcelas"
          error={formState.errors.installments?.message}
        >
          <Input
            inputMode="numeric"
            autoComplete="off"
            // Read-only, not disabled: a disabled field has no value for the form to validate.
            readOnly={amountsLocked}
            className={
              amountsLocked ? 'bg-muted text-muted-foreground tabular-nums' : 'tabular-nums'
            }
            {...register('installments')}
          />
        </FormField>
      </div>
      <p className="text-muted-foreground text-sm">
        {plan.isSplit
          ? 'Num parcelamento dividido, o valor e as parcelas não mudam: para mudar, encerre e crie outro.'
          : plan.settledCount > 0
            ? 'Com parcelas pagas, o valor e as parcelas não mudam: para mudar, encerre e crie outro.'
            : 'Mudar o valor ou as parcelas refaz todas as parcelas, e um ajuste feito à mão numa delas se perde.'}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      <Controller
        control={control}
        name="paymentMethod"
        render={({ field, fieldState }) => (
          <FormField
            id={id('payment-method')}
            label={`${paymentMethodFieldLabels[plan.type]} (opcional)`}
            error={fieldState.error?.message}
          >
            <PaymentMethodSelect value={field.value} onChange={field.onChange} />
          </FormField>
        )}
      />
      {plan.isSplit ? (
        <p className="text-muted-foreground text-sm">
          A divisão não muda aqui. Para dividir de outro jeito, encerre este parcelamento e crie
          outro.
        </p>
      ) : (
        <Controller
          control={control}
          name="person"
          render={({ field, fieldState }) => (
            <FormField
              id={id('person')}
              label={plan.type === 'CREDIT' ? 'A receber de (opcional)' : 'A pagar para (opcional)'}
              error={fieldState.error?.message}
            >
              <PersonSelect
                value={field.value}
                onChange={field.onChange}
                people={people}
                userId={userId}
                optional
                title={plan.type === 'CREDIT' ? 'A receber de' : 'A pagar para'}
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
