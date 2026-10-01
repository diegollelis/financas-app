# 0015 — `packages/shared` consumido como código-fonte TypeScript

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

O `packages/shared` ([0006](0006-validacao-zod-compartilhada.md)) é usado pela API (Node, compilada com `tsc` pelo Nest) e pelo front (Vite). Era preciso decidir se ele é **compilado** para JavaScript antes de ser consumido ou se os consumidores leem direto o `.ts`. Também era preciso garantir que todos os pacotes usem a **mesma versão do Zod**: duas cópias no monorepo quebram `instanceof` e a inferência de tipos de forma sutil.

## Opções consideradas

1. **Pacote compilado** (`tsc` → `dist/`, `exports` apontando para o `dist`): funciona em qualquer ambiente, mas exige rebuildar o shared a cada mudança e manter um watch extra em desenvolvimento.
2. **Project references (`tsc --build`)**: builds incrementais e ordenados, porém com mais configuração para manter.
3. **Código-fonte direto**: `exports` aponta para `src/index.ts`. O Vite entende TypeScript, e o Node (≥ 23.6) executa `.ts` removendo as anotações de tipo (_type stripping_). Não há etapa de build.

## Decisão

Opção 3: o `exports` do `@financas/shared` aponta para `./src/index.ts`.

- No shared: `erasableSyntaxOnly` e `verbatimModuleSyntax` ligados, e imports relativos **com extensão `.ts`** (`export * from './health.ts'`). É o que o type stripping do Node exige.
- Na API: `rewriteRelativeImportExtensions` ligado, para o `tsc` aceitar os imports `.ts` do shared ao checar os tipos. O shared não é copiado para o `dist` da API; em runtime, o Node lê o `.ts` direto do pacote.
- **Catálogo do pnpm** (`catalog:` em `pnpm-workspace.yaml`) para fixar uma única versão de `zod` e `typescript` em todos os pacotes.

## Consequências

- Mudou o shared, a API e o front enxergam na hora: não há build intermediário.
- O type stripping só remove sintaxe. Ficam **proibidos no shared**: `enum` (usar `z.enum([...])` ou objetos `as const`), `namespace` e _parameter properties_ em construtores. O `erasableSyntaxOnly` acusa esses usos no typecheck.
- A imagem Docker da API ([0009](0009-hospedagem-gratuita.md)) precisa incluir `packages/shared/src` e usar Node ≥ 24.
- Rever esta decisão se o shared crescer a ponto de pesar no tempo de inicialização da API ou se for publicado fora do monorepo (opção 1 ou 2).
