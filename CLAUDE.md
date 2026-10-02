# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Finanças App: a multi-user, public web app for monthly personal finance. Users record credits and debits, set a budget by percentages and track their balance. It replaces a personal Excel spreadsheet, which is kept out of the repo because it contains banking data. The repository is also a **full-stack learning lab** for the owner, who is moving from Protheus/AdvPL to modern web development. Explain the reasoning behind your choices, and record every new architectural decision as an ADR.

**Current state:** phase 1 (code foundation) is done: monorepo, API with `/health` and Prisma, web app calling it, shared Zod schemas, tests and CI. The only table is `workspaces`. Next is phase 2 (auth and workspaces) in `docs/roadmap.md`.

## Key docs (read before designing anything)

- `docs/adr/` holds the binding decisions. The index is `docs/adr/README.md`; copy `0000-template.md` for new ones and update the index.
- `docs/dominio/planilha-origem.md` describes the source spreadsheet's formulas and the problems the app must fix.
- `docs/dominio/modelo.md` has the entities, rules and default categories. `glossario.md` has the PT↔EN terms and the Protheus analogies.
- `docs/roadmap.md` lists the phases as checklists. Tick items as they are completed.

## Stack (see ADRs 0002–0019)

pnpm workspaces monorepo: `apps/web` (React 19 + Vite 8, TanStack Query, React Router 8, Tailwind 4 + shadcn/ui on Radix), `apps/api` (NestJS 12 as ESM on Express, Prisma 7, PostgreSQL 18), `packages/shared` (Zod schemas, types, money/date utils). TypeScript 6 (not 7: typescript-eslint does not support it yet). Auth will be Better Auth with cookie sessions; email goes through Resend. Hosting: Cloudflare Pages (web), Render via Docker (api), Neon (Postgres). Locally, Postgres runs in Docker.

## Commands

Run from the repo root. Package scripts run with `pnpm --filter @financas/<api|web|shared> <script>`.

| Task                                                              | Command                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| Install (also generates the Prisma client and installs git hooks) | `pnpm install`                                                        |
| Start / stop local Postgres                                       | `pnpm db:up` / `pnpm db:down`                                         |
| Apply migrations                                                  | `pnpm --filter @financas/api db:deploy`                               |
| Create a migration after editing `schema.prisma`                  | `pnpm --filter @financas/api db:migrate --name <change>`              |
| Run the API (watch, :3333) / the web app (:5173)                  | `pnpm --filter @financas/api dev` / `pnpm --filter @financas/web dev` |
| Lint / format / check format                                      | `pnpm lint` / `pnpm format` / `pnpm format:check`                     |
| Typecheck all packages                                            | `pnpm typecheck`                                                      |
| All tests                                                         | `pnpm test`                                                           |
| One package's tests                                               | `pnpm test --project api` (or `web`, `shared`)                        |
| One test file                                                     | `pnpm test apps/api/src/health/health.service.spec.ts`                |
| Tests whose name matches                                          | `pnpm test -t "degraded"`                                             |
| Coverage                                                          | `pnpm test:cov`                                                       |
| Build all                                                         | `pnpm build`                                                          |
| Scan the whole git history for secrets                            | `pnpm secrets`                                                        |

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint`, `typecheck`, `test` and `build`, plus a gitleaks job. Run the same commands before pushing.

## Workflow

- `main` is protected: no direct pushes, no force pushes. Work on a branch, push it and open a pull request. Both CI checks (`Lint, typecheck, testes e build` and `Varredura de segredos`) must pass, and the branch must be up to date with `main`.
- GitHub CLI is not installed: after pushing a branch, give the user the `https://github.com/diegollelis/financas-app/pull/new/<branch>` link.
- The pre-commit hook runs gitleaks on staged files. Never bypass it (`LEFTHOOK=0`) to get a commit through; fix the finding.

## Gotchas

- **API is ESM:** relative imports in `apps/api` end in `.js` even in `.ts` files (`'./app.module.js'`).
- **`packages/shared` has no build** (ADR 0015): consumers import its `.ts` source. Inside it, relative imports end in `.ts`, and `enum`, `namespace` and parameter properties are forbidden (use `z.enum([...])`).
- **Prisma client is generated** into `apps/api/src/generated/` (git-ignored) on `pnpm install`. After changing `schema.prisma`, run `db:migrate` or `db:generate`.
- **Shared versions** of `typescript`, `zod`, `prisma`, `@prisma/*` and `vitest` live in the `catalog:` of `pnpm-workspace.yaml`. Packages reference them as `"catalog:"`. Prisma is pinned exactly because npm's `latest` tag pointed at an 8.0 release candidate.
- **Install scripts** of dependencies are blocked by pnpm unless listed in `allowBuilds` (`pnpm-workspace.yaml`).
- **Env vars** are validated with Zod at startup (`apps/api/src/config/env.ts`, `apps/web/src/lib/env.ts`). Adding a variable means updating the schema and the `.env.example`. Tests never read `.env`; they get values from each `vitest.config.ts`.
- **shadcn/ui** components are copied into `apps/web/src/components/ui/`. Run `pnpm format` after adding one.

## Conventions that cut across the codebase

- **Multi-tenancy (ADR 0008):** every business table has `workspace_id`. Every repository query must filter by it, and routes are scoped as `/workspaces/:workspaceId/...` behind a membership/role guard. A cross-workspace access returns 404. Each new resource needs an isolation test.
- **Database (ADR 0017):** UUIDv7 ids; Prisma models in PascalCase mapped to snake_case plural tables; `created_at`/`updated_at` as `timestamptz(3)`.
- **Money and dates (ADR 0010):** store amounts as integer cents (`amount_cents`, always positive; the sign comes from `CREDIT`/`DEBIT`). Store percentages as integer basis points. Use `period` (`YYYY-MM`) for the accounting month, `due_date`, and `settled_at` (null = pending). Never use floats for money.
- **Language (ADR 0011):** code, identifiers, DB, API routes and commit messages are in English (Conventional Commits). UI text and all docs are in pt-BR.
- **Validation (ADR 0006):** Zod schemas in `packages/shared` are the single source of truth. The API always validates (Nest's built-in `StandardSchemaValidationPipe`); the web client validates every response (`apps/web/src/lib/api.ts`). OpenAPI schemas come from `z.toJSONSchema`.
- **Tests (ADR 0013):** Vitest everywhere. Specs sit next to the code (`*.spec.ts`); API HTTP tests live in `apps/api/test/`. Web tests use `renderWithProviders` and query by visible text.
- **Privacy (ADR 0012):** never log request bodies, descriptions, amounts or tokens. Never commit `.env`, spreadsheets or DB dumps. `.sql` is deliberately _not_ ignored, because Prisma migrations are `.sql`.
- **Public repository (ADR 0019):** the GitHub repo is public, so the whole history is visible. Never put real credentials or real personal/financial data in code, tests, docs or commit messages; test data is always fictitious. A gitleaks pre-commit hook (lefthook) and a CI job enforce this. If a secret ever leaks, rotate it; rewriting history is not enough.

## Environment notes

Development is on Windows. Node 26 is installed, and it no longer ships corepack, so install pnpm with `npm i -g pnpm`. Docker Desktop, git and gitleaks are installed; Docker Desktop is not always running, so start it before `pnpm db:up`. Commits use the GitHub noreply e-mail (repo-local git config). Local ports: API 3333, web 5173, Postgres 5434 on 127.0.0.1 (3000/3001 and 5432/5433 are taken by other projects on this machine). When stopping dev servers, kill only `node` processes by port: a Windows `svchost` (port proxy) also listens on 3000.
