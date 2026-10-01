# Roadmap

Cada fase termina com algo funcionando e revisado. Decisões novas surgidas no caminho viram ADRs ([docs/adr](adr/README.md)).

## Fase 0 — Planejamento ✅
- [x] Avaliação da planilha de origem ([dominio/planilha-origem.md](dominio/planilha-origem.md))
- [x] Stack, hospedagem e multi-tenancy decididos (ADRs 0001–0012)
- [x] Modelo de domínio inicial e glossário

## Fase 1 — Fundação do código
- [ ] Instalar pnpm (`npm i -g pnpm`)
- [ ] Monorepo pnpm workspaces, TypeScript base, ESLint e Prettier
- [ ] `apps/api`: NestJS com rota `/health`, Swagger, config por variáveis de ambiente
- [ ] `apps/web`: React + Vite + Tailwind + shadcn/ui, chamando `/health`
- [ ] `packages/shared`: primeiro schema Zod consumido pelos dois lados
- [ ] Postgres local via Docker Compose; Prisma configurado com a primeira migração
- [ ] Vitest nos três pacotes
- [ ] Repositório no GitHub + GitHub Actions (lint, typecheck, testes)
- [ ] Comandos documentados no `CLAUDE.md` e no `README.md`

## Fase 2 — Autenticação e espaços
- [ ] Better Auth: cadastro, login, verificação de e-mail, recuperação de senha (Resend), Google
- [ ] Rate limit nas rotas de autenticação
- [ ] Workspace, Member e papéis; espaço pessoal criado no cadastro
- [ ] Guard de espaço + repositórios sempre filtrando por `workspace_id`
- [ ] Testes de isolamento entre espaços
- [ ] RLS no PostgreSQL como segunda barreira (estudo)
- [ ] Convite de membros por e-mail

## Fase 3 — Núcleo financeiro
- [ ] Categorias (com categorias padrão no novo espaço)
- [ ] Lançamentos por competência: criar, editar, excluir, efetivar em um clique
- [ ] Configuração de orçamento por competência
- [ ] Painel do mês: indicadores da planilha, status por cor, gráfico
- [ ] Navegação entre competências

## Fase 4 — Deploy
- [ ] Conferir limites atuais dos planos gratuitos
- [ ] Neon (produção) + migrações no deploy
- [ ] API no Render (Docker) e front no Cloudflare Pages
- [ ] Sentry no front e na API (sem dados pessoais)
- [ ] Backup periódico do banco via GitHub Actions + teste de restauração

## Fase 5 — Evolução e abertura ao público
- [ ] Recorrências e parcelamentos
- [ ] Rateio de lançamentos (ADR próprio)
- [ ] Comparativos entre meses e gastos por categoria ao longo do tempo
- [ ] Importação do `.xlsx` (com relatório de inconsistências)
- [ ] LGPD: política de privacidade, termos, exportação e exclusão de conta
- [ ] Domínio próprio (`app.` e `api.`)
