# 0013 — Qualidade de código: TypeScript estrito, ESLint, Prettier e Vitest

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

Um único desenvolvedor, vindo do AdvPL, mantém três pacotes TypeScript ([0002](0002-monorepo-pnpm-workspaces.md)). Erros que o compilador ou o linter conseguem apontar não deveriam chegar à revisão nem à produção, e discussões de estilo não deveriam existir. Tudo precisa rodar igual na máquina local e no CI.

## Opções consideradas

1. **Biome** — lint e formatação numa única ferramenta rápida, mas sem regras que usam informação de tipos (ex.: promessa não aguardada) e com menos material de estudo.
2. **ESLint + Prettier** — padrão de mercado; o `typescript-eslint` traz regras que usam o type checker.
3. **Testes: Jest** (padrão do Nest) **ou Vitest** — o Vitest usa a mesma configuração do Vite no front, é mais rápido e tem API compatível com a do Jest.

## Decisão

- **TypeScript estrito** com um `tsconfig.base.json` na raiz que cada pacote estende: `strict`, `noUncheckedIndexedAccess` (acessar `array[i]` devolve `T | undefined`), `noImplicitOverride` e `noFallthroughCasesInSwitch`. `module`/`moduleResolution` ficam em cada pacote, porque Nest (Node) e Vite (bundler) resolvem módulos de formas diferentes.
- **TypeScript 6.0**, e não 7: o TS 7 (compilador nativo em Go) ainda não expõe a API em JavaScript de que `typescript-eslint` e outras ferramentas dependem. Rever quando o `typescript-eslint` suportar o 7.
- **ESLint** (flat config, `eslint.config.mjs`) com `typescript-eslint` em modo _type-checked_ e `eslint-config-prettier` para desligar regras de estilo.
- **Prettier** cuida de toda a formatação, inclusive dos docs em Markdown.
- **Vitest** nos três pacotes, inclusive na API no lugar do Jest. **Playwright** fica para os testes ponta a ponta ([0003](0003-frontend-react-vite-typescript.md)).
- `exactOptionalPropertyTypes` fica **desligado** por enquanto: gera atrito com tipos de bibliotecas (Prisma, React) maior que o benefício neste estágio.

## Consequências

- Na raiz: `pnpm lint`, `pnpm format`, `pnpm format:check` e `pnpm typecheck`. O CI roda os mesmos comandos.
- O lint com tipos é mais lento, pois precisa do compilador, mas pega erros reais como promessas esquecidas e `any` vazando.
- O Nest CLI gera projetos com Jest; na Fase 1 trocamos o runner pelo Vitest (com o plugin SWC para os decorators).
