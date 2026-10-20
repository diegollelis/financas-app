import { normalizeName } from './import-template.ts';

// Apelidos de estabelecimento (ADR 0055): the texts a merchant appears as in a card statement
// ("Ifd*Paladar Pizzas"). A statement title is compared with them after the same cleaning, and
// an alias counts when it is the beginning of the title; the longest one wins.

/** " - Parcela 3/10" at the end of a title: which installment, not who sold it. */
const INSTALLMENT_SUFFIX = /\s*-?\s*parcela\s+\d+\s*\/\s*\d+\s*$/;

/**
 * "IFD*Paladar  Pizzas - Parcela 3/10" → "ifd*paladar pizzas": no case, accents, extra spaces
 * or installment at the end. Both the title and the alias go through it.
 */
export function normalizeStatementTitle(text: string): string {
  return normalizeName(text).replace(INSTALLMENT_SUFFIX, '').trim();
}

/** The merchant of a statement title: the one whose alias begins it, the longest alias first. */
export function findMerchantByAlias(
  title: string,
  merchants: readonly { id: string; aliases: readonly { alias: string }[] }[],
): string | null {
  const wanted = normalizeStatementTitle(title);
  let found: { id: string; length: number } | null = null;
  for (const merchant of merchants) {
    for (const { alias } of merchant.aliases) {
      const key = normalizeStatementTitle(alias);
      if (key && wanted.startsWith(key) && key.length > (found?.length ?? 0)) {
        found = { id: merchant.id, length: key.length };
      }
    }
  }
  return found?.id ?? null;
}
