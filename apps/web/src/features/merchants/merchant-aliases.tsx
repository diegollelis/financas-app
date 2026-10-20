import {
  createMerchantAliasInputSchema,
  type CreateMerchantAliasInput,
  type Merchant,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/error-message';
import { useAddMerchantAlias, useRemoveMerchantAlias } from './use-merchants';

/**
 * The texts a merchant appears as in a card statement (ADR 0055): the list, each with "Remover",
 * and a field to add one. A title of the statement that begins with an alias is this merchant's.
 */
export function MerchantAliases({
  workspaceId,
  merchant,
  onDone,
}: {
  workspaceId: string;
  merchant: Merchant;
  onDone: () => void;
}) {
  const add = useAddMerchantAlias(workspaceId);
  const remove = useRemoveMerchantAlias(workspaceId);
  const { register, handleSubmit, formState, reset } = useForm<CreateMerchantAliasInput>({
    resolver: zodResolver(createMerchantAliasInputSchema),
    defaultValues: { alias: '' },
  });
  const fieldId = `alias-${merchant.id}`;

  return (
    <div className="grid gap-4">
      {/* The field first: the focus lands on it, never on a "Remover" (ADR 0036). */}
      <form
        noValidate
        className="grid gap-2"
        onSubmit={(event) =>
          void handleSubmit(({ alias }) =>
            add.mutate(
              { merchantId: merchant.id, alias },
              {
                onSuccess: () => {
                  toast.success('Apelido adicionado');
                  reset();
                },
              },
            ),
          )(event)
        }
      >
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <FormField id={fieldId} label="Novo apelido" error={formState.errors.alias?.message}>
            <Input autoComplete="off" placeholder="Ex.: Mp *Lojaexemplo" {...register('alias')} />
          </FormField>
          {/* Lined up with the bottom of the field, from sm. */}
          <Button type="submit" variant="outline" disabled={add.isPending}>
            {add.isPending ? 'Adicionando…' : 'Adicionar'}
          </Button>
        </div>
        {Boolean(add.error) && (
          <p role="alert" className="text-destructive">
            {apiErrorMessage(add.error)}
          </p>
        )}
      </form>
      {merchant.aliases.length > 0 ? (
        <ul className="divide-y rounded-xl border px-4" aria-label={`Apelidos de ${merchant.name}`}>
          {merchant.aliases.map((item) => (
            <li key={item.id} className="flex min-h-12 items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 break-words">{item.alias}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={remove.isPending}
                aria-label={`Remover ${item.alias}`}
                onClick={() =>
                  remove.mutate(
                    { merchantId: merchant.id, aliasId: item.id },
                    {
                      onSuccess: () => toast.success('Apelido removido'),
                      onError: (error) => toast.error(apiErrorMessage(error)),
                    },
                  )
                }
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Nenhum apelido ainda.</p>
      )}
      <div className="grid sm:flex sm:justify-end">
        <Button type="button" onClick={onDone}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
