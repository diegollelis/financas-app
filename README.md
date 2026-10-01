# Finanças App

Aplicação web multiusuário para controle financeiro mensal: créditos, débitos, orçamento por percentual e saldo. Nasce de uma planilha Excel pessoal e é desenvolvida como **laboratório de estudo full stack**, com cada decisão de arquitetura registrada.

> **Status:** em planejamento — documentação pronta, código a partir da [fase 1](docs/roadmap.md#fase-1--fundação-do-código).

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React + Vite + TypeScript, TanStack Query, Tailwind CSS + shadcn/ui |
| Backend | NestJS (Node + TypeScript) |
| Banco | PostgreSQL + Prisma |
| Validação | Zod compartilhado entre front e back |
| Autenticação | Better Auth (e-mail/senha e Google) + Resend |
| Hospedagem | Cloudflare Pages · Render · Neon (planos gratuitos) |
| Organização | Monorepo com pnpm workspaces |

## Documentação

- [Decisões de arquitetura (ADRs)](docs/adr/README.md)
- [Roadmap](docs/roadmap.md)
- Domínio: [planilha de origem](docs/dominio/planilha-origem.md) · [modelo](docs/dominio/modelo.md) · [glossário](docs/dominio/glossario.md)

## Pré-requisitos (a partir da fase 1)

- Node.js ≥ 22
- pnpm (`npm i -g pnpm`)
- Docker Desktop
- Git

## Estrutura

```
apps/web         frontend (SPA)
apps/api         API REST
packages/shared  schemas Zod, tipos e utilitários compartilhados
docs/            ADRs, domínio e roadmap
```
