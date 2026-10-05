# Finanças App

[![CI](https://github.com/diegollelis/financas-app/actions/workflows/ci.yml/badge.svg)](https://github.com/diegollelis/financas-app/actions/workflows/ci.yml)

Aplicação web multiusuário para controle financeiro mensal: créditos, débitos, orçamento por percentual e saldo. Nasce de uma planilha Excel pessoal e é desenvolvida como **laboratório de estudo full stack**, com cada decisão de arquitetura registrada em [ADRs](docs/adr/README.md).

> **Status:** fases 1 a 4 concluídas. O app está no ar em <https://financas-app-t2l.pages.dev>, com relatório de erros e backup diário. Próximo: a [fase 5](docs/roadmap.md#fase-5--evolução-e-abertura-ao-público). Roteiros: [deploy](docs/deploy.md) e [backup](docs/backup.md).

## Stack

| Camada       | Tecnologia                                                                         |
| ------------ | ---------------------------------------------------------------------------------- |
| Frontend     | React 19 + Vite 8 + TypeScript, TanStack Query, React Router, Tailwind + shadcn/ui |
| Backend      | NestJS 12 (Node + TypeScript)                                                      |
| Banco        | PostgreSQL 18 + Prisma 7                                                           |
| Validação    | Zod compartilhado entre front e back                                               |
| Testes       | Vitest + Testing Library                                                           |
| Autenticação | Better Auth (e-mail/senha e Google) + Resend _(fase 2)_                            |
| Hospedagem   | Cloudflare Pages · Render · Neon (planos gratuitos) _(fase 4)_                     |
| Organização  | Monorepo com pnpm workspaces                                                       |

## Pré-requisitos

- [Node.js](https://nodejs.org/) ≥ 24 (o projeto usa o 26; veja `.nvmrc`)
- pnpm: `npm i -g pnpm` (o Node ≥ 25 não traz mais o corepack)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git
- [gitleaks](https://github.com/gitleaks/gitleaks): `winget install Gitleaks.Gitleaks` (usado pelo hook de pre-commit)

## Rodando do zero

```sh
git clone https://github.com/diegollelis/financas-app.git
cd financas-app
pnpm install                                   # dependências, client do Prisma e git hooks

cp apps/api/.env.example apps/api/.env         # variáveis da API (gere um BETTER_AUTH_SECRET)
cp apps/web/.env.example apps/web/.env.local   # variáveis do front

pnpm db:up                                     # Postgres (porta 5434) e Mailpit no Docker; os testes precisam do Postgres
pnpm --filter @financas/api db:deploy          # cria as tabelas

pnpm --filter @financas/api dev                # API em http://localhost:3333 (Swagger em /docs)
pnpm --filter @financas/web dev                # em outro terminal: front em http://localhost:5173
```

Abra http://localhost:5173, crie uma conta em "Cadastre-se" e entre. Os e-mails (confirmação de cadastro, redefinição de senha) não saem da sua máquina: eles aparecem na caixa de entrada do Mailpit, em http://localhost:8025. A página inicial mostra o status da API e do banco: se aparecer "Online", está tudo funcionando.

## Comandos do dia a dia

| Comando                       | O que faz                                      |
| ----------------------------- | ---------------------------------------------- |
| `pnpm test`                   | todos os testes                                |
| `pnpm test --project api`     | testes de um pacote (`api`, `web` ou `shared`) |
| `pnpm test <arquivo>`         | testes de um arquivo                           |
| `pnpm test -t "<nome>"`       | testes cujo nome contém o texto                |
| `pnpm test:watch`             | testes em modo watch                           |
| `pnpm lint`                   | ESLint com verificação de tipos                |
| `pnpm format`                 | formata tudo com o Prettier                    |
| `pnpm typecheck`              | checa os tipos dos três pacotes                |
| `pnpm build`                  | compila a API e o front                        |
| `pnpm db:up` / `pnpm db:down` | liga / desliga o Postgres e o Mailpit locais   |
| `pnpm secrets`                | procura credenciais em todo o histórico do git |

Os comandos de cada pacote estão nos READMEs de [`apps/api`](apps/api/README.md), [`apps/web`](apps/web/README.md) e [`packages/shared`](packages/shared/README.md).

## Estrutura

```
apps/web         frontend (SPA)
apps/api         API REST + Prisma (schema e migrações)
packages/shared  schemas Zod, tipos e utilitários compartilhados
docs/            ADRs, domínio e roadmap
```

## Contribuindo

A `main` é protegida: toda mudança entra por pull request, com o CI verde (lint, tipos, testes, build e varredura de segredos). As mensagens de commit seguem o [Conventional Commits](https://www.conventionalcommits.org/), em inglês.

## Segurança e privacidade

Este repositório é público. Ele nunca contém credenciais, a planilha original nem dados financeiros reais. Os dados de teste são fictícios. As proteções (hook de pre-commit, varredura no CI e `.gitignore`) estão descritas no [ADR 0019](docs/adr/0019-repositorio-publico.md).

## Documentação

- [Decisões de arquitetura (ADRs)](docs/adr/README.md)
- [Roadmap](docs/roadmap.md)
- [Deploy em produção](docs/deploy.md)
- Domínio: [planilha de origem](docs/dominio/planilha-origem.md) · [modelo](docs/dominio/modelo.md) · [glossário](docs/dominio/glossario.md)

## Licença

[MIT](LICENSE)
