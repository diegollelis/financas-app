# 0003 — Frontend: React + Vite + TypeScript (SPA)

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto
O objetivo é empregabilidade full stack no mercado brasileiro e aprender as decisões de cada camada. A aplicação é autenticada (painel financeiro), sem necessidade de SEO nas telas internas.

## Opções consideradas
1. **Next.js (full stack)** — produtivo, mas mistura front e back e esconde decisões de API, CORS e deploy separado.
2. **Angular** — usado pela TOTVS (PO UI), porém com menor demanda geral que React.
3. **React + Vite (SPA)** — maior demanda de mercado, build rápido, hospedagem estática gratuita.

## Decisão
**React + Vite + TypeScript** como SPA, com:
- **React Router** — rotas;
- **TanStack Query** — cache e sincronização de dados da API;
- **React Hook Form + Zod** — formulários validados com os schemas de `packages/shared`;
- **Tailwind CSS + shadcn/ui** — estilo e componentes acessíveis;
- **Vitest + Testing Library** (unidade) e **Playwright** (ponta a ponta).

## Consequências
- O front é publicado como arquivos estáticos ([0009](0009-hospedagem-gratuita.md)).
- A API precisa tratar CORS e cookies entre origens; usar `app.` e `api.` do mesmo domínio próprio simplifica isso.
- Se surgir necessidade de SEO (ex.: landing page), avaliar uma página estática separada.
