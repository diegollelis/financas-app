import {
  loanCategoryLabels,
  normalizeName,
  transactionTypeLabels,
  type Category,
} from '@financas/shared';
import { useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { apiErrorMessage } from '@/lib/error-message';
import { useCreateCategory, useUpdateCategory } from './use-categories';

/** The option of Reembolso or Repasse: no category chosen, the shares stay where any split's go. */
const FALLBACK = 'fallback';

/**
 * The category of the other side a loans category chooses, both marked "Nem renda nem gasto":
 * on a debit one, "Categoria da devolução", where the money lent comes back (ADR 0058); on a
 * credit one, "Categoria da dívida", where the debt of money borrowed is kept (ADR 0059).
 * "Emprestado para" or "Peguei emprestado de" then puts each person's share there, and choosing
 * moves the shares already launched.
 */
export function LoanReturnDialog({
  workspaceId,
  category,
  categories,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  category: Category;
  /** Every category of the workspace: the options are the marked ones of the other side. */
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLElement | null>;
}) {
  const labels = loanCategoryLabels[category.type];
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={`${labels.choice}: ${category.name}`}
      description={labels.explanation}
    >
      {/* Mounted on each opening: the current choice, no error left over. */}
      {open && (
        <ReturnForm
          workspaceId={workspaceId}
          category={category}
          categories={categories}
          onDone={() => onOpenChange(false)}
        />
      )}
    </ResponsiveDialog>
  );
}

function ReturnForm({
  workspaceId,
  category,
  categories,
  onDone,
}: {
  workspaceId: string;
  category: Category;
  categories: Category[];
  onDone: () => void;
}) {
  const update = useUpdateCategory(workspaceId);
  const create = useCreateCategory(workspaceId);
  const labels = loanCategoryLabels[category.type];
  const otherType = category.type === 'DEBIT' ? 'CREDIT' : 'DEBIT';
  const otherSide = transactionTypeLabels[otherType].lower;
  const [choice, setChoice] = useState(category.returnCategoryId ?? FALLBACK);
  const options = categories.filter(
    (option) =>
      option.type === otherType && option.neutral && !option.archived && !option.splitRole,
  );
  // The category of the other side with the same name, to offer when none is marked yet.
  const namesake = categories.find(
    (option) =>
      option.type === otherType && normalizeName(option.name) === normalizeName(category.name),
  );
  const error = update.error ?? create.error;

  const save = () => {
    const returnCategoryId = choice === FALLBACK ? null : choice;
    const target = options.find((option) => option.id === returnCategoryId);
    update.mutate(
      { id: category.id, returnCategoryId },
      {
        onSuccess: () => {
          onDone();
          toast.success(
            `${labels.choiceToast} de ${category.name} ${target ? `entra em ${target.name}` : `fica em ${labels.fallback}`}`,
          );
        },
      },
    );
  };

  // Creates the category of the other side with the same name, or takes the one there is, marked
  // and offered.
  const adoptNamesake = async () => {
    const other = namesake ?? (await create.mutateAsync({ name: category.name, type: otherType }));
    await update.mutateAsync({ id: other.id, neutral: true, archived: false });
    setChoice(other.id);
  };

  return (
    <div className="grid gap-4">
      {options.length === 0 && (
        <div className="bg-accent grid justify-items-start gap-2 rounded-md p-3 text-sm">
          <p>Nenhuma categoria de {otherSide} está marcada "Nem renda nem gasto" ainda.</p>
          <Button
            variant="outline"
            size="sm"
            disabled={create.isPending || update.isPending}
            onClick={() => void adoptNamesake().catch(() => undefined)}
          >
            {namesake
              ? `Usar "${namesake.name}" de ${otherSide}`
              : `Criar "${category.name}" de ${otherSide}`}
          </Button>
        </div>
      )}
      <RadioGroup value={choice} onValueChange={setChoice} aria-label={labels.choice}>
        {options.map((option) => (
          <label
            key={option.id}
            className="has-data-checked:border-primary flex cursor-pointer items-start gap-3 rounded-lg border p-3"
          >
            <RadioGroupItem value={option.id} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="font-medium">{option.name}</span>
              <span className="text-muted-foreground text-sm">{labels.chosenHint}</span>
            </span>
          </label>
        ))}
        <label className="has-data-checked:border-primary flex cursor-pointer items-start gap-3 rounded-lg border p-3">
          <RadioGroupItem value={FALLBACK} className="mt-0.5" />
          <span className="grid gap-0.5">
            <span className="font-medium">{labels.fallback}</span>
            <span className="text-muted-foreground text-sm">{labels.fallbackHint}</span>
          </span>
        </label>
      </RadioGroup>
      {Boolean(error) && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button
          disabled={update.isPending || choice === (category.returnCategoryId ?? FALLBACK)}
          onClick={save}
        >
          {update.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
