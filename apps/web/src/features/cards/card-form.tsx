import {
  cardBillDueDate,
  cardNameSchema,
  formatIsoDate,
  statementBanks,
  statementBankSchema,
  todayIso,
  type Card,
  type CardFunction,
  type CreateCardInput,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useDialogDirty } from '@/components/dialog-dirty';
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

/** What a card does, as one choice among three (ADR 0062): a multiple card is one card. */
type Mode = 'CREDIT' | 'DEBIT' | 'BOTH';

const modeOptions = [
  { value: 'CREDIT', label: 'Crédito' },
  { value: 'DEBIT', label: 'Débito' },
  { value: 'BOTH', label: 'Crédito e débito' },
] as const;

const functionsOf = (mode: Mode): CardFunction[] =>
  mode === 'BOTH' ? ['CREDIT', 'DEBIT'] : [mode];

const modeOf = (functions: CardFunction[]): Mode =>
  functions.length === 2 ? 'BOTH' : (functions[0] ?? 'CREDIT');

// Radix Select has no empty value: "Outro banco" stands for a bank the app does not read yet.
const OTHER_BANK = 'OTHER';

/** The banks the app reads, plus "Outro banco". Inside `FormField`, which passes the id. */
function BankSelect({
  value,
  onChange,
  id,
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="w-full"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {statementBanks.map((bank) => (
          <SelectItem key={bank.bank} value={bank.bank}>
            {bank.label}
          </SelectItem>
        ))}
        <SelectItem value={OTHER_BANK}>Outro banco</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** A day of the month typed as text: 1 to 31. */
const dayOf = (text: string) => {
  const day = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
};

const cardFormSchema = z
  .object({
    name: cardNameSchema,
    bank: z.string(),
    mode: z.enum(['CREDIT', 'DEBIT', 'BOTH']),
    closingDay: z.string(),
    dueDay: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.mode === 'DEBIT') return;
    if (dayOf(values.closingDay) === null) {
      ctx.addIssue({ code: 'custom', path: ['closingDay'], message: 'Use um dia de 1 a 31.' });
    }
    if (dayOf(values.dueDay) === null) {
      ctx.addIssue({ code: 'custom', path: ['dueDay'], message: 'Use um dia de 1 a 31.' });
    }
  });

type CardFormValues = z.infer<typeof cardFormSchema>;

/** The form's values as the API takes them; the days only with the credit function. */
function cardInput(values: CardFormValues): CreateCardInput {
  const credit = values.mode !== 'DEBIT';
  const bank = statementBankSchema.safeParse(values.bank);
  return {
    name: values.name,
    bank: bank.success ? bank.data : null,
    functions: functionsOf(values.mode),
    closingDay: credit ? dayOf(values.closingDay) : null,
    dueDay: credit ? dayOf(values.dueDay) : null,
  };
}

/**
 * The card's name, bank, functions and, with Crédito, the days of its bill (ADR 0062), for a new
 * card and for editing one. Inside a dialog: mounted on each opening.
 */
export function CardForm({
  idPrefix,
  initial,
  functions,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  initial?: Card;
  /** For a new card: the functions it starts with, e.g. the one a transaction asks for. */
  functions?: CardFunction[];
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (input: CreateCardInput) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState, control } = useForm<CardFormValues>({
    resolver: zodResolver(cardFormSchema),
    defaultValues: {
      name: initial?.name ?? '',
      bank: initial ? (initial.bank ?? OTHER_BANK) : (statementBanks[0]?.bank ?? OTHER_BANK),
      mode: modeOf(initial?.functions ?? functions ?? ['CREDIT', 'DEBIT']),
      closingDay: initial?.closingDay ? String(initial.closingDay) : '',
      dueDay: initial?.dueDay ? String(initial.dueDay) : '',
    },
  });
  // Closing the dialog by mistake with something typed asks first.
  useDialogDirty(formState.isDirty);
  const mode = useWatch({ control, name: 'mode' });
  const closingDay = dayOf(useWatch({ control, name: 'closingDay' }) ?? '');
  const dueDay = dayOf(useWatch({ control, name: 'dueDay' }) ?? '');
  const credit = mode !== 'DEBIT';
  // What the days mean, with today's purchase: after the closing, it goes to the next bill.
  const today = todayIso();
  const example =
    credit && closingDay !== null && dueDay !== null
      ? cardBillDueDate({ closingDay, dueDay }, today)
      : null;
  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void handleSubmit((values) => onSubmit(cardInput(values)))(event)}
    >
      <FormField id={id('name')} label="Nome" error={formState.errors.name?.message}>
        <Input autoComplete="off" placeholder="Ex.: Cartão do dia a dia" {...register('name')} />
      </FormField>
      <Controller
        control={control}
        name="bank"
        render={({ field }) => (
          <FormField
            id={id('bank')}
            label="Banco"
            hint="“Outro banco” para um que o app ainda não lê."
          >
            <BankSelect value={field.value} onChange={field.onChange} />
          </FormField>
        )}
      />
      <div className="grid gap-2">
        <p aria-hidden className="text-sm font-medium">
          Funções
        </p>
        <Controller
          control={control}
          name="mode"
          render={({ field }) => (
            <SegmentedControl
              label="Funções"
              options={modeOptions}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      {credit && (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 items-start gap-4">
            <FormField
              id={id('closing-day')}
              label="Fecha no dia"
              error={formState.errors.closingDay?.message}
            >
              <Input
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ex.: 27"
                className="tabular-nums"
                {...register('closingDay')}
              />
            </FormField>
            <FormField
              id={id('due-day')}
              label="Vence no dia"
              error={formState.errors.dueDay?.message}
            >
              <Input
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ex.: 4"
                className="tabular-nums"
                {...register('dueDay')}
              />
            </FormField>
          </div>
          <p aria-live="polite" className="text-muted-foreground text-sm">
            {example
              ? `Uma compra hoje, ${formatIsoDate(today)}, entra na fatura que vence em ${formatIsoDate(example)}.`
              : 'Uma compra depois do fechamento entra na fatura seguinte.'}
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
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
