# 0017 — Convenções de banco e uso do Prisma 7

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

O [ADR 0005](0005-banco-postgresql-prisma.md) escolheu PostgreSQL + Prisma. Na fase 1, a versão estável é o **Prisma 7**, que mudou a forma de configurar: não lê mais o `.env` sozinho, usa `prisma.config.ts`, gera o client como código TypeScript dentro do projeto e exige um _driver adapter_ (`@prisma/adapter-pg`) para conectar. Antes da primeira migração, também era preciso fixar as convenções de nomes e de chaves.

## Opções consideradas

**Chave primária**

1. **Inteiro autoincremento**: compacto, mas sequencial. Expõe volume de dados e convida a "chutar" IDs de outros espaços.
2. **UUIDv4**: não adivinhável, mas aleatório, o que fragmenta o índice e não ordena por criação.
3. **UUIDv7**: não adivinhável na prática e ordenado pelo tempo de criação, bom para índices.

**Client gerado**

1. Versionar `src/generated/`: sempre presente, mas polui os diffs com código que não escrevemos.
2. Ignorar no git e gerar no `postinstall`: o schema é a fonte, como um build.

## Decisão

- **IDs UUIDv7** (`@default(uuid(7)) @db.Uuid`), gerados pelo Prisma.
- **Nomes**: models em `PascalCase` e campos em `camelCase` no Prisma; tabelas e colunas em `snake_case` no banco (`@@map`/`@map`), tabelas no plural (`workspaces`).
- **Timestamps** `created_at`/`updated_at` como `timestamptz(3)` em todas as tabelas ([0010](0010-dinheiro-e-datas.md)).
- **Prisma 7**, fixado em versão exata pelo catálogo do pnpm. Na época, a tag `latest` do npm apontava por engano para uma _release candidate_ da v8.
  - `prisma.config.ts` carrega o `.env` com `process.loadEnvFile` (nativo do Node), sem `dotenv`.
  - Client gerado em `apps/api/src/generated/prisma` (ESM), **fora do git**, recriado no `postinstall` da API.
  - `PrismaService` (provider global do Nest) conecta **sob demanda**: a API sobe mesmo com o banco dormindo (Neon, [0009](0009-hospedagem-gratuita.md)).
- **Postgres 18** local (`postgres:18-alpine`) na porta **5434** do host. As portas 5432/5433 estão ocupadas por bancos de outros projetos nesta máquina.
- **`/health`** sempre responde 200 enquanto o processo vive e informa no corpo se o banco responde (`database: up | down`). Assim a hospedagem não reinicia a API por uma instabilidade do banco.

## Consequências

- Criar ou alterar tabela: editar `prisma/schema.prisma` e rodar `pnpm --filter @financas/api db:migrate --name <descricao>`. A migração `.sql` gerada é versionada.
- Em produção, as migrações rodam com `db:deploy` (`prisma migrate deploy`), nunca com `migrate dev`.
- O Prisma 7 roda scripts de instalação (download do _schema engine_), liberados em `allowBuilds` no `pnpm-workspace.yaml`.
- Conferir no deploy (fase 4) se o Neon oferece Postgres 18. Se não, alinhar a versão local com a de produção.
