import type { BudgetShareKey } from '@financas/shared';

/** The four destinations of the income, as the spreadsheet names them. */
export const shareLabels: Record<BudgetShareKey, string> = {
  expensesBp: 'Despesas',
  investmentsBp: 'Investimentos',
  emergencyReserveBp: 'Reserva de emergência',
  travelBp: 'Viagens',
};
