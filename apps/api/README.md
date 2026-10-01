# apps/api

API REST: NestJS 12 (ESM, Express) + Prisma + PostgreSQL ([ADR 0004](../../docs/adr/0004-backend-nestjs.md), [ADR 0005](../../docs/adr/0005-banco-postgresql-prisma.md), [ADR 0014](../../docs/adr/0014-api-nest12-esm-express.md)).

## Rodando localmente

```sh
cp apps/api/.env.example apps/api/.env   # uma vez
pnpm --filter @financas/api dev          # modo watch em http://localhost:3333
```

- `GET /health`: verificação de saúde
- `/docs`: Swagger (só fora de produção)

## Scripts

| Comando          | O que faz                               |
| ---------------- | --------------------------------------- |
| `pnpm dev`       | sobe a API com recarga automática       |
| `pnpm build`     | compila para `dist/`                    |
| `pnpm start`     | roda o build compilado (`dist/main.js`) |
| `pnpm typecheck` | checa os tipos sem gerar arquivos       |

Rode-os dentro de `apps/api` ou, da raiz, com `pnpm --filter @financas/api <script>`.

## Variáveis de ambiente

Validadas com Zod na inicialização (`src/config/env.ts`). A API não sobe se alguma for inválida. Veja a lista em `.env.example`.

## Estrutura

```
src/
  main.ts          bootstrap: CORS, Swagger, porta
  app.module.ts    módulo raiz
  config/env.ts    schema das variáveis de ambiente
  health/          módulo de exemplo (controller + module)
```
