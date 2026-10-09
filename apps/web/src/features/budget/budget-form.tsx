import {
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
 * budget's order. Once read, Despesas is a share of the net income and the saving destinations
 * share what is left after expenses, adding up to at most 100% (ADR 0047).
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
  .refine(
    (form) =>
      form.shares
        .filter((share) => share.kind === 'SAVINGS')
        .reduce((sum, share) => sum + share.basisPoints, 0) <= FULL_BASIS_POINTS,
    { message: 'A soma dos destinos de guardar não pode passar de 100%.', path: ['shares'] },
  )
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
}: {
  initial: Budget;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  /** Rejects when saving fails; the form shows that through `error`. */
  onSubmit: (input: BudgetInput) => Promise<unknown>;
  /** In a dialog: closes it without saving. */
  onCancel?: () => void;
}) {
  const { register, handleSubmit, formState, control, reset, getValues } = useForm<
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
  // The 100% rule is on the whole list: React Hook Form keeps such an error under `root`.
  const sumError =
    formState.errors.shares?.root?.message ?? formState.errors.shares?.message ?? null;
  // A live preview from whatever is typed so far: Despesas in reais, the saving ones' sum.
  const typed = useWatch({ control });
  const netIncome = parseReais(typed.netIncomeCents ?? '');
  const typedShares = typed.shares ?? [];
  const savingPercents = initial.shares.flatMap((share, index) =>
    share.kind === 'SAVINGS' ? [parsePercent(typedShares[index]?.basisPoints ?? '')] : [],
  );
  const savingTotal = savingPercents.every((value) => value !== null)
    ? savingPercents.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;

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
        {share.kind === 'EXPENSES' && (
          // Despesas is the only one with a known base when typing: the net income.
          <span className="text-muted-foreground flex h-11 items-center tabular-nums md:h-8">
            {netIncome !== null && typedPercent !== null
              ? formatCents(shareOfIncome(netIncome, typedPercent))
              : '—'}
          </span>
        )}
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
      <fieldset className="grid gap-3">
        <legend className="mb-1 font-medium">Limite de despesas</legend>
        <p className="text-muted-foreground text-sm">Percentual da renda líquida.</p>
        {expenses.map(shareField)}
      </fieldset>
      {savings.length > 0 && (
        <fieldset className="grid gap-3">
          <legend className="mb-1 font-medium">Destinos de guardar</legend>
          <p className="text-muted-foreground text-sm">
            Percentual do que sobrar no mês depois das despesas.
          </p>
          {savings.map(shareField)}
          {savingTotal !== null && (
            <p
              className={
                savingTotal > FULL_BASIS_POINTS
                  ? 'text-destructive'
                  : 'text-muted-foreground tabular-nums'
              }
            >
              Soma: {formatBasisPoints(savingTotal)}
              {savingTotal < FULL_BASIS_POINTS &&
                `. Sem destino: ${formatBasisPoints(FULL_BASIS_POINTS - savingTotal)}`}
            </p>
          )}
          {sumError && (
            <p role="alert" className="text-destructive">
              {sumError}
            </p>
          )}
        </fieldset>
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
