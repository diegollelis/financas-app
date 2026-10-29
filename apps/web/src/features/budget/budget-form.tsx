import {
  BUDGET_SHARES_OVER,
  budgetSharesTotal,
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
import { useDialogDirty } from '@/components/dialog-dirty';

/** Text typed in a field → number, or a pt-BR message. */
function textField(parse: (text: string) => number | null, messages: Record<string, string>) {
  return z.string().transform((text, ctx) => {
    const value = parse(text);
    if (text.trim() === '' || value === null) {
      ctx.addIssue({
        code: 'custom',
        message: text.trim() === '' ? messages.required! : messages.invalid!,
      });
      return z.NEVER;
    }
    return value;
  });
}

const percent = { required: 'Informe o percentual.', invalid: 'Use um percentual como 12,5.' };

/**
 * The fields hold text (reais and percentages as typed), one percentage per destination in the
 * budget's order. Once read, every one is a share of the net income, the limit and the goals
 * alike, and they add up to at most 100% (ADR 0064).
 */
const budgetFormSchema = z
  .object({
    netIncomeCents: textField(parseReais, {
      required: 'Informe a renda líquida.',
      invalid: 'Use um valor como 1.234,56.',
    }),
    shares: z.array(
      z.object({
        destinationId: z.string(),
        kind: z.enum(['EXPENSES', 'SAVINGS']),
        basisPoints: textField(parsePercent, percent),
      }),
    ),
  })
  .refine((form) => budgetSharesTotal(form.shares) <= FULL_BASIS_POINTS, {
    message: BUDGET_SHARES_OVER,
    path: ['shares'],
  })
  .transform((form): BudgetInput => ({
    netIncomeCents: form.netIncomeCents,
    shares: form.shares.map(({ destinationId, basisPoints }) => ({ destinationId, basisPoints })),
  }));

type FormInput = z.input<typeof budgetFormSchema>;

/** 15990 → "159,90" and 1250 → "12,5": the numbers as the person would type them. */
const amountText = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });
const percentText = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function BudgetForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
  monthIncomeCents,
}: {
  initial: Budget;
  /**
   * The month's credits without the shares of a split (ADR 0046 note): "Usar as entradas do mês"
   * fills the net income with them, when the plan should follow what came in.
   */
  monthIncomeCents?: number;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  /** Rejects when saving fails; the form shows that through `error`. */
  onSubmit: (input: BudgetInput) => Promise<unknown>;
  /** In a dialog: closes it without saving. */
  onCancel?: () => void;
}) {
  const { register, handleSubmit, formState, control, reset, getValues, setValue } = useForm<
    FormInput,
    unknown,
    BudgetInput
  >({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: {
      netIncomeCents: amountText.format(initial.netIncomeCents / 100),
      shares: initial.shares.map((share) => ({
        destinationId: share.destinationId,
        kind: share.kind,
        basisPoints: percentText.format(share.basisPoints / 100),
      })),
    },
  });
  // Closing the dialog by mistake with something typed asks first.
  useDialogDirty(formState.isDirty);
  // The 100% rule is on the whole list: React Hook Form keeps such an error under `root`.
  const sumError =
    formState.errors.shares?.root?.message ?? formState.errors.shares?.message ?? null;
  // A live preview from whatever is typed so far: each share in reais, and the total.
  const typed = useWatch({ control });
  const netIncome = parseReais(typed.netIncomeCents ?? '');
  const typedShares = typed.shares ?? [];
  const percents = initial.shares.map((_, index) =>
    parsePercent(typedShares[index]?.basisPoints ?? ''),
  );
  const total = percents.every((value) => value !== null)
    ? percents.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
  const inReais = (basisPoints: number | null) =>
    netIncome !== null && basisPoints !== null
      ? formatCents(shareOfIncome(netIncome, basisPoints))
      : null;
  const free = total !== null ? FULL_BASIS_POINTS - total : null;

  const submit = async (input: BudgetInput) => {
    try {
      await onSubmit(input);
      // What was saved becomes the baseline of the form.
      reset(getValues());
    } catch {
      // Shown through `error`.
    }
  };

  const shareField = (index: number) => {
    const share = initial.shares[index]!;
    const fieldError = formState.errors.shares?.[index]?.basisPoints?.message;
    const typedPercent = parsePercent(typedShares[index]?.basisPoints ?? '');
    return (
      <div key={share.destinationId} className="grid grid-cols-[1fr_auto] items-end gap-3">
        <FormField
          id={`share-${share.destinationId}`}
          label={`${share.name} (%)`}
          error={fieldError}
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            {...register(`shares.${index}.basisPoints`)}
          />
        </FormField>
        {/* Every share is of the net income (ADR 0064): its amount as it is typed. */}
        <span className="text-muted-foreground flex h-11 items-center tabular-nums md:h-8">
          {inReais(typedPercent) ?? '—'}
        </span>
      </div>
    );
  };
  const indexes = initial.shares.map((_, index) => index);
  const expenses = indexes.filter((index) => initial.shares[index]!.kind === 'EXPENSES');
  const savings = indexes.filter((index) => initial.shares[index]!.kind === 'SAVINGS');

  return (
    <form noValidate className="grid gap-4" onSubmit={(event) => void handleSubmit(submit)(event)}>
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
      {/* Offered only when it would change something: the month's credits, typed for you. */}
      {monthIncomeCents !== undefined && monthIncomeCents > 0 && netIncome !== monthIncomeCents && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="-mt-2 justify-self-start"
          onClick={() =>
            setValue('netIncomeCents', amountText.format(monthIncomeCents / 100), {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        >
          Usar as entradas do mês ({formatCents(monthIncomeCents)})
        </Button>
      )}
      <fieldset className="grid gap-3">
        <legend className="mb-1 font-medium">Limite de gastos</legend>
        <p className="text-muted-foreground text-sm">Percentual da renda líquida.</p>
        {expenses.map(shareField)}
      </fieldset>
      {savings.length > 0 && (
        <fieldset className="grid gap-3">
          <legend className="mb-1 font-medium">Metas</legend>
          <p className="text-muted-foreground text-sm">Percentual da renda líquida.</p>
          {savings.map(shareField)}
        </fieldset>
      )}
      {/* The limit and the goals add up to 100% at most; what is left is "Sem meta". */}
      {total !== null && free !== null && (
        <p
          aria-live="polite"
          className={free < 0 ? 'text-destructive' : 'text-muted-foreground tabular-nums'}
        >
          Total: {formatBasisPoints(total)}
          {free > 0 &&
            `. Sem meta: ${formatBasisPoints(free)}${inReais(free) ? ` (${inReais(free)})` : ''}`}
        </p>
      )}
      {sumError && (
        <p role="alert" className="text-destructive">
          {sumError}
        </p>
      )}
      {Boolean(error) && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(error)}
        </p>
      )}
      <div className={onCancel ? 'flex justify-end gap-2' : undefined}>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
