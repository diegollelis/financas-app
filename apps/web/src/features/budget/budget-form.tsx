import {
  budgetInputSchema,
  budgetShareKeys,
  formatBasisPoints,
  formatCents,
  FULL_BASIS_POINTS,
  parsePercent,
  parseReais,
  shareOfIncome,
  type Budget,
  type BudgetInput,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/error-message';
import { shareLabels } from './share-labels';

/** Text typed in a field → number, or a pt-BR message; an empty optional field is null. */
function textField(parse: (text: string) => number | null, messages: Record<string, string>) {
  return z.string().transform((text, ctx) => {
    if (text.trim() === '') {
      if (!messages.required) return null;
      ctx.addIssue({ code: 'custom', message: messages.required });
      return z.NEVER;
    }
    const value = parse(text);
    if (value === null) {
      ctx.addIssue({ code: 'custom', message: messages.invalid ?? '' });
      return z.NEVER;
    }
    return value;
  });
}

const money = { invalid: 'Use um valor como 1.234,56.' };
const percent = { required: 'Informe o percentual.', invalid: 'Use um percentual como 12,5.' };

/**
 * The fields have the API's names but hold text (reais and percentages as typed). Once read
 * into cents and basis points, the shared schema checks the rules, including the 100% sum.
 */
const budgetFormSchema = z
  .object({
    netIncomeCents: textField(parseReais, { ...money, required: 'Informe a renda líquida.' }),
    grossIncomeCents: textField(parseReais, money),
    expensesBp: textField(parsePercent, percent),
    investmentsBp: textField(parsePercent, percent),
    emergencyReserveBp: textField(parsePercent, percent),
    travelBp: textField(parsePercent, percent),
  })
  .pipe(budgetInputSchema);

type FormInput = z.input<typeof budgetFormSchema>;

/** 15990 → "159,90" and 1250 → "12,5": the numbers as the person would type them. */
const amountText = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });
const percentText = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function BudgetForm({
  initial,
  submitLabel,
  pending,
  error,
  saved,
  onSubmit,
}: {
  initial: Budget;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  /** Shows "Orçamento salvo." until the next change. */
  saved: boolean;
  /** Rejects when saving fails; the page shows that through `error`. */
  onSubmit: (input: BudgetInput) => Promise<unknown>;
}) {
  const { register, handleSubmit, formState, control, reset, getValues } = useForm<
    FormInput,
    unknown,
    BudgetInput
  >({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: {
      netIncomeCents: amountText.format(initial.netIncomeCents / 100),
      grossIncomeCents:
        initial.grossIncomeCents === null ? '' : amountText.format(initial.grossIncomeCents / 100),
      ...Object.fromEntries(
        budgetShareKeys.map((key) => [key, percentText.format(initial[key] / 100)]),
      ),
    },
  });
  // A live preview of what each percentage means in reais, from whatever is typed so far.
  const typed = useWatch({ control });
  const netIncome = parseReais(typed.netIncomeCents ?? '');
  const shares = budgetShareKeys.map((key) => parsePercent(typed[key] ?? ''));
  const total = shares.every((share) => share !== null)
    ? shares.reduce<number>((sum, share) => sum + share, 0)
    : null;

  const submit = async (input: BudgetInput) => {
    try {
      await onSubmit(input);
      // What was saved becomes the baseline: editing again hides "Orçamento salvo.".
      reset(getValues());
    } catch {
      // Shown through `error`.
    }
  };

  return (
    <form noValidate className="grid gap-4" onSubmit={(event) => void handleSubmit(submit)(event)}>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          id="net-income"
          label="Renda líquida (R$)"
          error={formState.errors.netIncomeCents?.message}
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            {...register('netIncomeCents')}
          />
        </FormField>
        <FormField
          id="gross-income"
          label="Renda bruta (R$, opcional)"
          error={formState.errors.grossIncomeCents?.message}
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            {...register('grossIncomeCents')}
          />
        </FormField>
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-2 font-medium">Destino da renda líquida</legend>
        {budgetShareKeys.map((key, index) => {
          const share = shares[index];
          return (
            <div key={key} className="grid grid-cols-[1fr_auto] items-end gap-3">
              <FormField
                id={`share-${key}`}
                label={`${shareLabels[key]} (%)`}
                error={formState.errors[key]?.message}
              >
                <Input inputMode="decimal" autoComplete="off" {...register(key)} />
              </FormField>
              <span className="text-muted-foreground h-9 py-2 tabular-nums">
                {netIncome !== null && share != null
                  ? formatCents(shareOfIncome(netIncome, share))
                  : '—'}
              </span>
            </div>
          );
        })}
        {total !== null && (
          <p
            className={
              total > FULL_BASIS_POINTS ? 'text-destructive' : 'text-muted-foreground tabular-nums'
            }
          >
            Soma: {formatBasisPoints(total)}
            {total < FULL_BASIS_POINTS &&
              ` · sem destino: ${formatBasisPoints(FULL_BASIS_POINTS - total)}`}
          </p>
        )}
      </fieldset>
      {Boolean(error) && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(error)}
        </p>
      )}
      {saved && !formState.isDirty && <p role="status">Orçamento salvo.</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
