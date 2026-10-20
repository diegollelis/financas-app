import {
  formatCents,
  installmentCountSchema,
  parseReais,
  splitInstallments,
} from '@financas/shared';

/** "Começa na parcela", as typed: blank is the first one. */
export function firstNumberOf(text: string) {
  return text.trim() === '' ? 1 : Number(text);
}

/**
 * "10 parcelas de R$ 35,00, total R$ 350,00", or, when cents are left over, "3 parcelas:
 * 2 de R$ 333,33 e a última de R$ 333,34": what will be created, before it is. A purchase already
 * running says which ones: "Da 3/10 à 10/10: 8 parcelas de R$ 50,00, total R$ 400,00."
 */
export function installmentsPreview(
  amountText: string,
  countText: string,
  firstText: string,
  amountIs: 'TOTAL' | 'INSTALLMENT',
) {
  const cents = parseReais(amountText);
  const count = installmentCountSchema.safeParse(Number(countText));
  const firstNumber = firstNumberOf(firstText);
  if (cents === null || cents <= 0 || !count.success) return null;
  if (!Number.isInteger(firstNumber) || firstNumber < 1 || firstNumber > count.data) return null;
  const created = count.data - firstNumber + 1;
  const total = amountIs === 'TOTAL' ? cents : cents * created;
  if (amountIs === 'TOTAL' && total < created) return null;
  const parts = splitInstallments(total, created);
  const first = parts[0] ?? 0;
  const last = parts.at(-1) ?? 0;
  const which =
    firstNumber > 1 ? `Da ${firstNumber}/${count.data} à ${count.data}/${count.data}: ` : '';
  const many = created === 1 ? '1 parcela' : `${created} parcelas`;
  if (first === last) {
    return `${which}${many} de ${formatCents(first)}, total ${formatCents(total)}.`;
  }
  return `${which}${many}: ${created - 1} de ${formatCents(first)} e a última de ${formatCents(last)}, total ${formatCents(total)}.`;
}
