# apps/api

API REST: NestJS 12 (ESM, Express) + Prisma 7 + PostgreSQL ([ADR 0004](../../docs/adr/0004-backend-nestjs.md), [ADR 0005](../../docs/adr/0005-banco-postgresql-prisma.md), [ADR 0014](../../docs/adr/0014-api-nest12-esm-express.md), [ADR 0017](../../docs/adr/0017-convencoes-de-banco-e-prisma-7.md)).

## Rodando localmente

```sh
cp apps/api/.env.example apps/api/.env   # uma vez
pnpm db:up                               # Postgres no Docker (raiz do repo), porta 5434
pnpm --filter @financas/api db:deploy    # aplica as migrações pendentes
pnpm --filter @financas/api dev          # modo watch em http://localhost:3333
```

- `GET /health`: verificação de saúde (`database: up | down`)
- `/docs`: Swagger (só fora de produção)

## Scripts

| Comando                    | O que faz                                                      |
| -------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                 | sobe a API com recarga automática                              |
| `pnpm build`               | compila para `dist/`                                           |
| `pnpm start`               | roda o build compilado (`dist/main.js`)                        |
| `pnpm typecheck`           | checa os tipos sem gerar arquivos                              |
| `pnpm db:migrate --name x` | cria uma migração a partir do `schema.prisma` e a aplica (dev) |
| `pnpm db:deploy`           | aplica migrações pendentes (produção e máquinas novas)         |
| `pnpm db:generate`         | regenera o client do Prisma (roda sozinho no `pnpm install`)   |
| `pnpm db:studio`           | abre o Prisma Studio para inspecionar os dados                 |

Rode-os dentro de `apps/api` ou, da raiz, com `pnpm --filter @financas/api <script>`.

## Variáveis de ambiente

Validadas com Zod na inicialização (`src/config/env.ts`). A API não sobe se alguma for inválida. Veja a lista em `.env.example`.

## Estrutura

```
prisma/
  schema.prisma     dicionário de dados (models, tabelas, colunas)
  migrations/       migrações SQL versionadas
prisma.config.ts    configuração do Prisma CLI
src/
  main.ts           bootstrap: CORS, Swagger, porta
  app.module.ts     módulo raiz
  config/env.ts     schema das variáveis de ambiente
  prisma/           PrismaService (client do banco como provider global)
  health/           módulo de exemplo (controller + service + module)
  generated/        client do Prisma gerado (fora do git)
```
