import { cardFunctionLabels, type Card, type CardFunction } from '@financas/shared';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { CardForm } from './card-form';
import { bankLabel } from './card-label';
import { cardsFor } from './card-rules';
import { useCreateCard } from './use-cards';

// Not a card: the item that opens the form of a new one.
const NEW_CARD = 'NEW_CARD';

/**
 * "Cartão" of a Crédito or Débito one (ADR 0062): the cards with that function, and "Novo cartão"
 * to add one without leaving the form, chosen once created. Inside `FormField`, which passes the
 * id and the error's aria props.
 */
export function CardSelect({
  cards,
  role,
  value,
  onChange,
  id,
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
}: {
  cards: readonly Card[];
  role: CardFunction;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const [creating, setCreating] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { id: workspaceId } = useCurrentWorkspace();
  const create = useCreateCard(workspaceId);
  const options = cardsFor(cards, role, value);

  return (
    <>
      <Select
        value={value}
        onValueChange={(next) => (next === NEW_CARD ? setCreating(true) : onChange(next))}
      >
        <SelectTrigger
          ref={trigger}
          id={id}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="w-full"
        >
          <SelectValue placeholder={`Escolha o cartão do ${cardFunctionLabels[role]}`} />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((card) => (
            <SelectItem key={card.id} value={card.id} textValue={card.name}>
              {card.name}
              <span className="text-muted-foreground"> {bankLabel(card)}</span>
            </SelectItem>
          ))}
          {options.length > 0 && <SelectSeparator />}
          <SelectItem value={NEW_CARD} className="text-primary font-medium">
            Novo cartão
          </SelectItem>
        </SelectContent>
      </Select>
      <ResponsiveDialog
        open={creating}
        onOpenChange={setCreating}
        returnFocusTo={trigger}
        title="Novo cartão"
        description={`Ele já vem escolhido neste lançamento, no ${cardFunctionLabels[role]}.`}
      >
        <CardForm
          idPrefix={`${id ?? 'card'}-new`}
          functions={[role]}
          submitLabel={create.isPending ? 'Adicionando…' : 'Adicionar cartão'}
          pending={create.isPending}
          error={create.error}
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: (card) => {
                toast.success('Cartão adicionado');
                setCreating(false);
                // Chosen only when it has the function this transaction uses.
                if (card.functions.includes(role)) onChange(card.id);
              },
            })
          }
          onCancel={() => setCreating(false)}
        />
      </ResponsiveDialog>
    </>
  );
}
