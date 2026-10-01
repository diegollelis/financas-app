# 0010 — Representação de dinheiro e datas

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto
Na planilha, valores são números de ponto flutuante e existe uma única coluna "Data", sem distinguir vencimento de pagamento. Ponto flutuante gera erros de arredondamento (`0.1 + 0.2 !== 0.3`), e a data ambígua impede alertas de vencimento.

## Opções consideradas
- **Dinheiro:** `float`/`number` · `DECIMAL(12,2)` no banco com biblioteca decimal no código · **centavos em inteiro**.
- **Datas:** coluna única · **datas separadas por propósito**.

## Decisão
**Dinheiro**
- No banco: `amount_cents` como `INTEGER` (`BIGINT` se necessário), sempre positivo; o sinal vem do tipo (crédito/débito).
- Na API: inteiros em centavos. Na UI: formatação `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Percentuais (orçamento) em **pontos-base** inteiros (60% = 6000).
- Moeda única (BRL) por enquanto.

**Datas**
- `period` (competência): ano-mês ao qual o lançamento pertence (`YYYY-MM`), substitui as abas mensais.
- `due_date`: data de vencimento/previsão (`DATE`).
- `settled_at`: data em que foi efetivamente pago/recebido (`DATE`, nula enquanto pendente).
- Timestamps técnicos (`created_at`, `updated_at`) em UTC (`timestamptz`); exibição no fuso `America/Sao_Paulo` e formato `dd/MM/yyyy`.

## Consequências
- Somatórios exatos, sem arredondamento acumulado.
- Status deriva de `settled_at` (pendente / efetivado) e de `due_date` (vencido).
- Conversões centavos ↔ reais ficam em funções utilitárias em `packages/shared`.
