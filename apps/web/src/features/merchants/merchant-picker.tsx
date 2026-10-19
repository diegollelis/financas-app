import { normalizeName, type Merchant } from '@financas/shared';
import { useState } from 'react';
import { NameList, PickerShell } from '@/components/name-picker';

const sameName = (a: string, b: string) => normalizeName(a) === normalizeName(b);

/**
 * The merchant field (ADR 0053), the same picker as the person's: a search over the active
 * merchants and "Adicionar 'Nome'" for one not listed yet. Its value is a name, resolved on save
 * (a new one becomes a merchant then); "Nenhum" clears it. FormField hands it the id and the
 * error wiring. `pending`: names added elsewhere in the same import, not created yet (ADR 0055
 * note), offered apart so they can be picked again.
 */
export function MerchantSelect({
  id,
  value,
  onChange,
  merchants,
  pending = [],
  ...aria
}: {
  id?: string;
  value: string;
  onChange: (name: string) => void;
  merchants: Merchant[];
  pending?: readonly { name: string; aliases: readonly string[] }[];
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const [open, setOpen] = useState(false);
  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <PickerShell
      id={id}
      text={value || 'Nenhum'}
      placeholder={!value}
      title="Estabelecimento"
      description="Toque num estabelecimento, ou digite um nome para buscar ou adicionar."
      open={open}
      onOpenChange={setOpen}
      aria={aria}
      list={(autoFocus) => (
        <NameList
          // Found by its aliases too (ADR 0055).
          groups={[
            {
              heading: 'Cadastrados',
              items: merchants
                .filter((merchant) => !merchant.archived)
                .map(({ id, name, aliases }) => ({
                  id,
                  name,
                  aliases: aliases.map((item) => item.alias),
                })),
            },
            ...(pending.length > 0
              ? [
                  {
                    heading: 'Novos, criados ao importar',
                    items: pending.map(({ name, aliases }) => ({
                      id: `novo:${normalizeName(name)}`,
                      name,
                      aliases,
                    })),
                  },
                ]
              : []),
          ]}
          knownNames={[...merchants, ...pending].map((merchant) => merchant.name)}
          isPicked={(name) => sameName(name, value)}
          onPick={pick}
          clearLabel={value ? 'Nenhum' : undefined}
          multiple={false}
          autoFocus={autoFocus}
          searchLabel="Buscar estabelecimento"
          placeholder="Buscar ou adicionar estabelecimento"
          emptyText="Digite o nome de um estabelecimento para adicionar."
        />
      )}
    />
  );
}
