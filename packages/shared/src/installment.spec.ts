import { describe, expect, it } from 'vitest';
import {
  createInstallmentPlanInputSchema,
  installmentPlanTotal,
  splitInstallments,
} from './installment.ts';

describe('splitInstallments', () => {
  it('splits the total in equal parts, the leftover cents on the last one', () => {
    expect(splitInstallments(100_000, 3)).toEqual([33_333, 33_333, 33_334]);
    expect(splitInstallments(120_000, 12)).toEqual(Array(12).fill(10_000));
    expect(splitInstallments(10, 4)).toEqual([2, 2, 2, 4]);
  });

  it('always adds up to the total', () => {
    for (const [total, count] of [
      [99_999, 7],
      [1_234_567, 72],
      [2, 2],
    ] as const) {
      expect(splitInstallments(total, count).reduce((sum, cents) => sum + cents, 0)).toBe(total);
    }
  });
});

describe('createInstallmentPlanInputSchema', () => {
  // Fictitious ids (ADR 0019).
  const valid = {
    type: 'DEBIT',
    description: 'Geladeira',
    categoryId: '01920000-0000-7000-8000-000000000101',
    installments: 10,
    amountCents: 350_000,
    amountIs: 'TOTAL',
    firstPeriod: '2026-10',
  } as const;

  it('takes the total or each installment', () => {
    const total = createInstallmentPlanInputSchema.parse(valid);
    expect(installmentPlanTotal(total)).toBe(350_000);
    const each = createInstallmentPlanInputSchema.parse({
      ...valid,
      amountCents: 35_000,
      amountIs: 'INSTALLMENT',
    });
    expect(installmentPlanTotal(each)).toBe(350_000);
  });

  it('refuses fewer than 2 or more than 72 installments', () => {
    for (const installments of [1, 73]) {
      const result = createInstallmentPlanInputSchema.safeParse({ ...valid, installments });
      expect(result.error?.issues[0]?.message).toBe('Use de 2 a 72 parcelas.');
    }
  });

  it('refuses a total that does not give a cent to each installment', () => {
    const result = createInstallmentPlanInputSchema.safeParse({ ...valid, amountCents: 5 });
    expect(result.error?.issues[0]?.message).toBe(
      'O total precisa dar ao menos um centavo por parcela.',
    );
  });

  describe('split (ADR 0052)', () => {
    const ana = '01920000-0000-7000-8000-000000000301';
    const message = (input: object) =>
      createInstallmentPlanInputSchema.safeParse({ ...valid, ...input }).error?.issues[0]?.message;

    it('takes shares in the meaning of the amount: of the total, or of each installment', () => {
      expect(message({ split: [{ personId: ana, amountCents: 175_000 }] })).toBeUndefined();
      expect(
        message({
          amountCents: 35_000,
          amountIs: 'INSTALLMENT',
          split: [{ newPersonName: 'Bruno', amountCents: 35_000 }],
        }),
      ).toBeUndefined();
    });

    it('refuses shares bigger than the amount, the same person twice, or a person as well', () => {
      expect(message({ split: [{ personId: ana, amountCents: 350_001 }] })).toBe(
        'As partes dos outros passam do valor do lançamento.',
      );
      expect(
        message({
          split: [
            { newPersonName: 'Ana', amountCents: 100 },
            { newPersonName: 'ana', amountCents: 100 },
          ],
        }),
      ).toBe('A mesma pessoa aparece duas vezes.');
      expect(message({ personId: ana, split: [{ personId: ana, amountCents: 100 }] })).toBe(
        'Um lançamento dividido não fica ligado a uma só pessoa.',
      );
    });

    it('refuses a share of the total that does not give a cent to each installment', () => {
      expect(message({ split: [{ personId: ana, amountCents: 9 }] })).toBe(
        'Cada parte precisa dar ao menos um centavo por parcela.',
      );
    });
  });
});
