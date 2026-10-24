import { describe, expect, it } from 'vitest';
import { parseNubankAccountCsv } from './account-statement.ts';

// An invented statement in the Nubank account format (ADR 0019: never a real one). Names,
// documents, banks and accounts are made up.
const csv = [
  'Data,Valor,Identificador,Descrição',
  '01/10/2026,-150.00,6a1f0000-0000-4000-8000-000000000001,Transferência enviada pelo Pix - MARIA DE SOUZA EXEMPLO - •••.123.456-•• - BANCO EXEMPLO S.A. (0999) Agência: 1 Conta: 12345-6',
  '06/10/2026,320.5,6a1f0000-0000-4000-8000-000000000002,Transferência recebida pelo Pix - Pedro Exemplo - •••.654.321-•• - BANCO EXEMPLO S.A. (0999) Agência: 2 Conta: 6543-2',
  '07/10/2026,1000.00,6a1f0000-0000-4000-8000-000000000003,Transferência Recebida - ANA EXEMPLO - •••.111.222-•• - NU PAGAMENTOS - IP (0260) Agência: 1 Conta: 1111-1',
  '08/10/2026,-45.90,6a1f0000-0000-4000-8000-000000000004,Compra no débito - PADARIA EXEMPLO',
  '09/10/2026,-210.00,6a1f0000-0000-4000-8000-000000000005,Pagamento de boleto efetuado - ENERGIA EXEMPLO S.A.',
  '10/10/2026,-2500.00,6a1f0000-0000-4000-8000-000000000006,Pagamento de fatura',
  '11/10/2026,300.00,6a1f0000-0000-4000-8000-000000000007,Resgate RDB',
  '12/10/2026,-89.00,6a1f0000-0000-4000-8000-000000000008,Transferência enviada pelo Pix - LOJA EXEMPLO LTDA - 12.345.678/0001-90 - BANCO EXEMPLO S.A. (0999) Agência: 3 Conta: 3333-3',
  '13/10/2026,12.00,6a1f0000-0000-4000-8000-000000000009,Estorno - Compra no débito - PADARIA EXEMPLO',
  '14/10/2026,-5.00,6a1f0000-0000-4000-8000-000000000010,Tarifa de exemplo - 99.999.999/0001-99',
  '',
].join('\n');

describe('parseNubankAccountCsv', () => {
  it('reads each movement: the day, the amount and its side, the identifier and what it is', () => {
    const { lines, issues } = parseNubankAccountCsv(csv);

    expect(issues).toEqual([]);
    expect(lines[0]).toEqual({
      line: 2,
      externalId: 'NUBANK:6a1f0000-0000-4000-8000-000000000001',
      occurredOn: '2026-10-01',
      type: 'DEBIT',
      amountCents: 15_000,
      kind: 'PIX',
      counterpart: 'Maria de Souza Exemplo',
      counterpartIs: 'PERSON',
      description: 'Maria de Souza Exemplo',
      paymentMethod: 'PIX',
    });
    expect(lines[1]).toEqual(
      expect.objectContaining({
        type: 'CREDIT',
        amountCents: 32_050,
        kind: 'PIX',
        counterpart: 'Pedro Exemplo',
      }),
    );
  });

  it('keeps only the name of the other side: never the document, the bank or the account', () => {
    const { lines } = parseNubankAccountCsv(csv);
    const kept = JSON.stringify(lines);

    for (const part of ['123.456', '12.345.678', 'Agência', 'Conta:', '0999', 'NU PAGAMENTOS']) {
      expect(kept).not.toContain(part);
    }
    // A CNPJ says a company.
    expect(lines[7]).toEqual(
      expect.objectContaining({ counterpart: 'Loja Exemplo Ltda', counterpartIs: 'COMPANY' }),
    );
    // A line the reader does not know keeps only its first part.
    expect(lines[9]).toEqual(
      expect.objectContaining({
        kind: 'OTHER',
        counterpart: null,
        description: 'Tarifa de exemplo',
      }),
    );
  });

  it('tells transfers, debit purchases, boletos, the card bill, savings and refunds apart', () => {
    const { lines } = parseNubankAccountCsv(csv);

    expect(lines.map((line) => [line.kind, line.paymentMethod, line.description])).toEqual([
      ['PIX', 'PIX', 'Maria de Souza Exemplo'],
      ['PIX', 'PIX', 'Pedro Exemplo'],
      ['TRANSFER', 'TRANSFER', 'Ana Exemplo'],
      ['DEBIT_PURCHASE', 'DEBIT_CARD', 'Padaria Exemplo'],
      ['BOLETO', 'BOLETO', 'Energia Exemplo S.A.'],
      ['CARD_BILL', null, 'Pagamento de fatura'],
      ['SAVINGS', null, 'Caixinha'],
      ['PIX', 'PIX', 'Loja Exemplo Ltda'],
      ['REFUND', null, 'Padaria Exemplo'],
      ['OTHER', null, 'Tarifa de exemplo'],
    ]);
  });

  it('reports a line it cannot read, skips a zero amount and reads a repeated identifier once', () => {
    const { lines, issues } = parseNubankAccountCsv(
      [
        '\uFEFFDescrição,Identificador,Valor,Data',
        'Pix - Exemplo,id-1,-10.00,31/02/2026',
        'Pix - Exemplo,id-2,dez,01/10/2026',
        'Pix - Exemplo,id 3,-10.00,01/10/2026',
        'Pix - Exemplo,id-4,0.00,01/10/2026',
        'Compra no débito - Loja,id-5,-10.00,01/10/2026',
        'Compra no débito - Loja,id-5,-10.00,01/10/2026',
      ].join('\r\n'),
    );

    expect(issues.map((issue) => [issue.line, issue.message])).toEqual([
      [2, 'Data inválida nesta linha.'],
      [3, 'Valor inválido nesta linha.'],
      [4, 'Identificador inválido nesta linha.'],
    ]);
    expect(lines.map((line) => line.externalId)).toEqual(['NUBANK:id-5']);
  });

  it('refuses a file without the columns, and one without movements', () => {
    expect(parseNubankAccountCsv('date,title,amount\n2026-10-01,Loja,"10,00"').issues).toEqual([
      expect.objectContaining({ line: 1, severity: 'error' }),
    ]);
    expect(parseNubankAccountCsv('Data,Valor,Identificador,Descrição\n').issues).toEqual([
      { line: null, severity: 'error', message: 'O extrato não tem movimentos.' },
    ]);
  });
});
