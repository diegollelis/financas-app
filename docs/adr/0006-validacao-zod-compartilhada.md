# 0006 — Validação com Zod compartilhado

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

As mesmas regras (ex.: valor > 0, categoria do tipo certo, percentuais do orçamento somando 100%) precisam valer no formulário e na API. Duplicar regras gera divergência.

## Opções consideradas

1. **class-validator (padrão do Nest) + validação separada no front** — duplicação.
2. **Zod em `packages/shared`** — um schema gera a validação e o tipo TypeScript, usado nos dois lados.

## Decisão

Schemas **Zod** em `packages/shared`, consumidos pelo front (React Hook Form) e pela API (pipe de validação Zod no Nest). Os tipos de entrada e saída da API são inferidos dos schemas.

## Consequências

- Uma única fonte de verdade para regras de entrada (equivalente ao X3_VALID do Protheus).
- **A API sempre valida** — a validação no front serve só à experiência de uso.
- Regras que dependem do banco (ex.: a categoria pertence ao espaço) ficam no service.
