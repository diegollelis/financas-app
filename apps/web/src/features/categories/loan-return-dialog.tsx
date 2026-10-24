import { normalizeName, type Category } from '@financas/shared';
import { useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { apiErrorMessage } from '@/lib/error-message';
import { useCreateCategory, useUpdateCategory } from './use-categories';

/** The option of Reembolso: no return category, the shares stay where any split's go. */
const REIMBURSEMENT = 'reimbursement';

/**
 * "Onde entra a volta" (ADR 0058): on a debit category marked "Nem renda nem gasto", the credit
 * category, also marked, where the money lent comes back. "Emprestado para" then puts each
 * person's share there, and choosing moves the shares already launched.
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
  /** Every category of the workspace: the options are the marked credit ones. */
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLElement | null>;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={`Onde entra a volta: ${category.name}`}
      description='Ao emprestar com "Emprestado para", o valor a receber de cada pessoa cai na categoria escolhida. Vale também para os já lançados.'
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
  const [choice, setChoice] = useState(category.returnCategoryId ?? REIMBURSEMENT);
  const options = categories.filter(
    (option) => option.type === 'CREDIT' && option.neutral && !option.archived && !option.splitRole,
  );
  // The credit category of the same name, to offer when none is marked yet.
  const namesake = categories.find(
    (option) =>
      option.type === 'CREDIT' && normalizeName(option.name) === normalizeName(category.name),
  );
  const error = update.error ?? create.error;

  const save = () => {
    const returnCategoryId = choice === REIMBURSEMENT ? null : choice;
    const target = options.find((option) => option.id === returnCategoryId);
    update.mutate(
      { id: category.id, returnCategoryId },
      {
        onSuccess: () => {
          onDone();
          toast.success(
            target
              ? `A volta de ${category.name} entra em ${target.name}`
              : `A volta de ${category.name} fica em Reembolso`,
          );
        },
      },
    );
  };

  // Creates the credit category of the same name, or takes the one there is, marked and offered.
  const adoptNamesake = async () => {
    const credit = namesake ?? (await create.mutateAsync({ name: category.name, type: 'CREDIT' }));
    await update.mutateAsync({ id: credit.id, neutral: true, archived: false });
    setChoice(credit.id);
  };

  return (
    <div className="grid gap-4">
      {options.length === 0 && (
        <div className="bg-accent grid justify-items-start gap-2 rounded-md p-3 text-sm">
          <p>Nenhuma categoria de entrada está marcada "Nem renda nem gasto" ainda.</p>
          <Button
            variant="outline"
            size="sm"
            disabled={create.isPending || update.isPending}
            onClick={() => void adoptNamesake().catch(() => undefined)}
          >
            {namesake
              ? `Usar "${namesake.name}" de entrada`
              : `Criar "${category.name}" de entrada`}
          </Button>
        </div>
      )}
      <RadioGroup value={choice} onValueChange={setChoice} aria-label="Onde entra a volta">
        {options.map((option) => (
          <label
            key={option.id}
            className="has-data-checked:border-primary flex cursor-pointer items-start gap-3 rounded-lg border p-3"
          >
            <RadioGroupItem value={option.id} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="font-medium">{option.name}</span>
              <span className="text-muted-foreground text-sm">
                Nem renda nem gasto: fora da renda e das metas
              </span>
            </span>
          </label>
        ))}
        <label className="has-data-checked:border-primary flex cursor-pointer items-start gap-3 rounded-lg border p-3">
          <RadioGroupItem value={REIMBURSEMENT} className="mt-0.5" />
          <span className="grid gap-0.5">
            <span className="font-medium">Reembolso</span>
            <span className="text-muted-foreground text-sm">
              Como uma divisão comum: o valor volta para a sobra
            </span>
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
          disabled={update.isPending || choice === (category.returnCategoryId ?? REIMBURSEMENT)}
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
