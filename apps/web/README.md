# apps/web

Frontend SPA: React 19 + Vite 8 + TypeScript, TanStack Query, React Router 8, Tailwind CSS 4 + shadcn/ui ([ADR 0003](../../docs/adr/0003-frontend-react-vite-typescript.md), [ADR 0016](../../docs/adr/0016-estrutura-do-front.md)).

## Rodando localmente

```sh
cp apps/web/.env.example apps/web/.env.local   # uma vez
pnpm --filter @financas/api dev                # API em http://localhost:3333
pnpm --filter @financas/web dev                # front em http://localhost:5173
```

## Scripts

| Comando          | O que faz                                  |
| ---------------- | ------------------------------------------ |
| `pnpm dev`       | servidor de desenvolvimento com HMR        |
| `pnpm build`     | checa tipos e gera os estáticos em `dist/` |
| `pnpm preview`   | serve o build de produção localmente       |
| `pnpm typecheck` | checa os tipos sem gerar arquivos          |

## Estrutura

```
src/
  main.tsx              providers (TanStack Query, Router)
  router.tsx            rotas
  routes/               páginas
  features/<assunto>/   hooks e componentes de um assunto
  components/ui/        componentes do shadcn/ui (código nosso)
  lib/api.ts            cliente da API: valida respostas com os schemas de @financas/shared
  lib/env.ts            variáveis VITE_* validadas com Zod
```

## Componentes do shadcn/ui

```sh
pnpm dlx shadcn@latest add <componente>   # rodar dentro de apps/web
```
