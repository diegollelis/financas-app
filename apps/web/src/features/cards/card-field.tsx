import type { Card, CardFunction } from '@financas/shared';
import { Controller, type Control } from 'react-hook-form';
import { FormField } from '@/components/form-field';
import type { CardFormFields } from './card-rules';
import { CardSelect } from './card-select';

/** "Cartão", right after the method, only with Crédito or Débito: then required (ADR 0062 note). */
export function CardField({
  control,
  id,
  cards,
  role,
  className,
}: {
  control: Control<CardFormFields>;
  id: string;
  cards: readonly Card[];
  role: CardFunction;
  className?: string;
}) {
  return (
    <Controller
      control={control}
      name="cardId"
      render={({ field, fieldState }) => (
        <div className={className}>
          <FormField id={id} label="Cartão" error={fieldState.error?.message}>
            <CardSelect cards={cards} role={role} value={field.value} onChange={field.onChange} />
          </FormField>
        </div>
      )}
    />
  );
}
