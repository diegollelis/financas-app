import { describe, expect, it } from 'vitest';
import { parseNubankCsv, statementTitleKey } from './statement.ts';

// An invented statement in the Nubank format (ADR 0019: never a real one).
const csv = [
  'date,title,amount',
  '2026-10-03,Ifd*Pizzaria Exemplo,"86,50"',
  '2026-09-28,Loja Exemplo - Parcela 3/10,"50,00"',
  '2026-10-10,Pagamento recebido,"- 1.234,56"',
  '2026-10-12,IOF de volta,"- 1,64"',
  '2026-10-14,"Mercado Exemplo, Centro","5.150,01"',
  '',
].join('\n');

describe('parseNubankCsv', () => {
  it('reads each line: the day, the title, the amount and what it is', () => {
    const { lines, issues } = parseNubankCsv(csv);

    expect(issues).toEqual([]);
    expect(lines).toEqual([
      {
        line: 2,
        occurredOn: '2026-10-03',
        title: 'Ifd*Pizzaria Exemplo',
        cleanTitle: 'Ifd*Pizzaria Exemplo',
        amountCents: 8_650,
        installment: null,
        kind: 'PURCHASE',
      },
      {
        line: 3,
        occurredOn: '2026-09-28',
        title: 'Loja Exemplo - Parcela 3/10',
        cleanTitle: 'Loja Exemplo',
        amountCents: 5_000,
        installment: { number: 3, count: 10 },
        kind: 'PURCHASE',
      },
      // The last bill's payment, not an inflow.
      expect.objectContaining({ line: 4, amountCents: 123_456, kind: 'PAYMENT' }),
      // Money given back: an inflow.
      expect.objectContaining({ line: 5, amountCents: 164, kind: 'REFUND' }),
      // A comma inside quotes stays in the title.
      expect.objectContaining({
        line: 6,
        title: 'Mercado Exemplo, Centro',
        amountCents: 515_001,
      }),
    ]);
  });

  it('finds the columns by title, takes a byte order mark and Windows line ends', () => {
    const { lines, issues } = parseNubankCsv(
      '\uFEFFamount,date,title\r\n"10,00",16/10/2026,Padaria Exemplo\r\n',
    );

    expect(issues).toEqual([]);
    expect(lines[0]).toMatchObject({
      occurredOn: '2026-10-16',
      title: 'Padaria Exemplo',
      amountCents: 1_000,
    });
  });

  it('reports the lines it cannot read, skips a zero amount and keeps the rest', () => {
    const { lines, issues } = parseNubankCsv(
      [
        'date,title,amount',
        'ontem,Padaria Exemplo,"10,00"',
        '2026-10-16,,"10,00"',
        '2026-10-16,Padaria Exemplo,dez reais',
        '2026-10-16,Ajuste,"0,00"',
        '2026-10-17,Padaria Exemplo,"12,00"',
      ].join('\n'),
    );

    expect(issues).toEqual([
      { line: 2, severity: 'error', message: 'Data inválida nesta linha.' },
      { line: 3, severity: 'error', message: 'Linha sem descrição.' },
      { line: 4, severity: 'error', message: 'Valor inválido nesta linha.' },
    ]);
    expect(lines.map((line) => line.line)).toEqual([6]);
  });

  it('refuses a file that is not a Nubank statement, and an empty one', () => {
    expect(parseNubankCsv('Data,Descrição,Valor\n16/10/2026,Padaria,10').issues).toEqual([
      {
        line: 1,
        severity: 'error',
        message:
          'Este arquivo não parece a fatura do Nubank: faltam as colunas date, title e amount.',
      },
    ]);
    expect(parseNubankCsv('date,title,amount\n').issues).toEqual([
      { line: null, severity: 'error', message: 'A fatura não tem lançamentos.' },
    ]);
  });

  it('takes "Parcela n/N" only when it makes sense', () => {
    const { lines } = parseNubankCsv(
      [
        'date,title,amount',
        '2026-10-01,Loja Exemplo Parcela 1/2,"10,00"',
        '2026-10-01,Loja Exemplo - Parcela 5/3,"10,00"',
      ].join('\n'),
    );

    expect(lines.map((line) => line.installment)).toEqual([{ number: 1, count: 2 }, null]);
  });
});

describe('statementTitleKey', () => {
  it('groups the lines of one merchant, whatever the case or the installment', () => {
    expect(statementTitleKey({ title: 'IFD*Pizzaria  Exemplo' })).toBe(
      statementTitleKey({ title: 'Ifd*Pizzaria Exemplo - Parcela 2/3' }),
    );
  });
});
