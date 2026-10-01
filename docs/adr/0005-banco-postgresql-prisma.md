# 0005 — Banco: PostgreSQL + Prisma

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto
Dados financeiros relacionais (espaços, membros, categorias, lançamentos, parcelamentos), com necessidade de integridade, somatórios por período e isolamento entre espaços.

## Opções consideradas
1. **MongoDB** — flexível, mas o domínio é claramente relacional.
2. **SQLite/Turso** — simples, porém com recursos limitados (ex.: RLS) para multiusuário.
3. **PostgreSQL** — padrão de mercado, transações, constraints, Row Level Security, plano gratuito no Neon.

ORM: **Prisma** (schema declarativo legível, migrações, client tipado) ou **Drizzle** (mais próximo do SQL). O Prisma tem mais material de estudo, e o schema funciona como "dicionário de dados".

## Decisão
- **PostgreSQL**: em **Docker** no desenvolvimento local e no **Neon** em produção ([0009](0009-hospedagem-gratuita.md)).
- **Prisma** para schema e migrações; migrações versionadas no Git e aplicadas no deploy (`prisma migrate deploy`).
- SQL puro é permitido quando o Prisma não atender (relatórios, políticas RLS), sempre dentro de migrações.

## Consequências
- O `schema.prisma` é o equivalente ao dicionário SX2/SX3 do Protheus.
- Toda tabela de dados de negócio tem `workspace_id` ([0008](0008-multi-tenancy-por-espaco.md)).
- Valores monetários e datas seguem [0010](0010-dinheiro-e-datas.md).
