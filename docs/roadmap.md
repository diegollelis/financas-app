# Roadmap

Cada fase termina com algo funcionando e revisado. Decisões novas surgidas no caminho viram ADRs ([docs/adr](adr/README.md)).

## Fase 0 — Planejamento ✅

- [x] Avaliação da planilha de origem ([dominio/planilha-origem.md](dominio/planilha-origem.md))
- [x] Stack, hospedagem e multi-tenancy decididos (ADRs 0001–0012)
- [x] Modelo de domínio inicial e glossário

## Fase 1 — Fundação do código ✅

- [x] Instalar pnpm (`npm i -g pnpm`)
- [x] Monorepo pnpm workspaces, TypeScript base, ESLint e Prettier
- [x] `apps/api`: NestJS com rota `/health`, Swagger, config por variáveis de ambiente
- [x] `apps/web`: React + Vite + Tailwind + shadcn/ui, chamando `/health`
- [x] `packages/shared`: primeiro schema Zod consumido pelos dois lados
- [x] Postgres local via Docker Compose; Prisma configurado com a primeira migração
- [x] Vitest nos três pacotes
- [x] GitHub Actions: workflow de CI (lint, typecheck, testes, build) e Dependabot
- [x] Criar o repositório no GitHub, fazer o primeiro push e proteger a `main`
- [x] Repositório público: proteção contra vazamento de segredos ([ADR 0019](adr/0019-repositorio-publico.md))
- [x] Comandos documentados no `CLAUDE.md` e no `README.md`

## Fase 2 — Autenticação e espaços

- [x] Better Auth ([ADR 0020](adr/0020-integracao-better-auth-nestjs.md))
  - [x] API: cadastro, login e logout com e-mail e senha; `GET /me`; testes com Postgres real
  - [x] Web: telas de cadastro, login e logout ([ADR 0021](adr/0021-sessao-e-formularios-no-front.md))
  - [x] Verificação de e-mail e recuperação de senha (Mailpit local, Resend em produção — [ADR 0022](adr/0022-envio-de-email.md))
  - [x] Login com Google ([ADR 0026](adr/0026-login-com-google.md))
- [x] Rate limit nas rotas de autenticação ([ADR 0023](adr/0023-rate-limit-autenticacao.md))
- [x] Workspace, Member e papéis; espaço pessoal criado no cadastro ([ADR 0024](adr/0024-espacos-membros-e-espaco-pessoal.md))
- [x] Guard de espaço + repositórios sempre filtrando por `workspace_id` ([ADR 0025](adr/0025-guard-de-espaco-e-isolamento.md))
- [x] Testes de isolamento entre espaços (`expectHiddenFromOutsiders`, um por recurso)
- [ ] RLS no PostgreSQL como segunda barreira (estudo)
- [ ] Convite de membros por e-mail ([ADR 0027](adr/0027-convites-por-email.md))
  - [x] API: convidar, listar, cancelar, ver e aceitar pelo link
  - [ ] Web: página do espaço (membros e convite), página do convite e volta após o login

## Fase 3 — Núcleo financeiro

- [ ] Categorias (com categorias padrão no novo espaço)
- [ ] Lançamentos por competência: criar, editar, excluir, efetivar em um clique
- [ ] Configuração de orçamento por competência
- [ ] Painel do mês: indicadores da planilha, status por cor, gráfico
- [ ] Navegação entre competências

## Fase 4 — Deploy

- [ ] Conferir limites atuais dos planos gratuitos
- [ ] Neon (produção, PostgreSQL 18+: as migrações usam `uuidv7()`) + migrações no deploy
- [ ] API no Render (Docker) e front no Cloudflare Pages
- [ ] IP real do cliente atrás do proxy do Render para o rate limit ([ADR 0023](adr/0023-rate-limit-autenticacao.md))
- [ ] Google OAuth de produção: URI de retorno, origens e tela de consentimento publicada ([ADR 0026](adr/0026-login-com-google.md))
- [ ] Cookies entre front e API em sites diferentes ([ADR 0020](adr/0020-integracao-better-auth-nestjs.md))
- [ ] Sentry no front e na API (sem dados pessoais)
- [ ] Backup periódico do banco via GitHub Actions + teste de restauração

## Fase 5 — Evolução e abertura ao público

- [ ] Recorrências e parcelamentos
- [ ] Rateio de lançamentos (ADR próprio)
- [ ] Comparativos entre meses e gastos por categoria ao longo do tempo
- [ ] Importação do `.xlsx` (com relatório de inconsistências)
- [ ] LGPD: política de privacidade, termos, exportação e exclusão de conta
- [ ] Domínio próprio (`app.` e `api.`)
