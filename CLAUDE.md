# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Finanças App: a multi-user, public web app for monthly personal finance. Users record credits and debits, set a budget by percentages and track their balance. It replaces a personal Excel spreadsheet, which is kept out of the repo because it contains banking data. The repository is also a **full-stack learning lab** for the owner, who is moving from Protheus/AdvPL to modern web development. Explain the reasoning behind your choices, and record every new architectural decision as an ADR.

**Current state:** documentation only (phase 0 done). No code, package.json or commands exist yet. Phase 1 of `docs/roadmap.md` creates them. When it does, add the build, test and lint commands (including how to run a single test) to this file.

## Key docs (read before designing anything)

- `docs/adr/` holds the binding decisions. The index is `docs/adr/README.md`; copy `0000-template.md` for new ones and update the index.
- `docs/dominio/planilha-origem.md` describes the source spreadsheet's formulas and the problems the app must fix.
- `docs/dominio/modelo.md` has the entities, rules and default categories. `glossario.md` has the PT↔EN terms and the Protheus analogies.
- `docs/roadmap.md` lists the phases as checklists. Tick items as they are completed.

## Stack (see ADRs 0002–0009)

pnpm workspaces monorepo: `apps/web` (React + Vite + TS, TanStack Query, React Router, Tailwind + shadcn/ui), `apps/api` (NestJS, Prisma, PostgreSQL), `packages/shared` (Zod schemas, types, money/date utils). Auth is Better Auth with cookie sessions; email goes through Resend. Hosting: Cloudflare Pages (web), Render via Docker (api), Neon (Postgres). Locally, Postgres runs in Docker.

## Conventions that cut across the codebase

- **Multi-tenancy (ADR 0008):** every business table has `workspace_id`. Every repository query must filter by it, and routes are scoped as `/workspaces/:workspaceId/...` behind a membership/role guard. A cross-workspace access returns 404. Each new resource needs an isolation test.
- **Money and dates (ADR 0010):** store amounts as integer cents (`amount_cents`, always positive; the sign comes from `CREDIT`/`DEBIT`). Store percentages as integer basis points. Use `period` (`YYYY-MM`) for the accounting month, `due_date`, and `settled_at` (null = pending). Never use floats for money.
- **Language (ADR 0011):** code, identifiers, DB, API routes and commit messages are in English (Conventional Commits). UI text and all docs are in pt-BR.
- **Validation (ADR 0006):** Zod schemas in `packages/shared` are the single source of truth. The API always validates.
- **Privacy (ADR 0012):** never log request bodies, descriptions, amounts or tokens. Never commit `.env`, spreadsheets or DB dumps. `.sql` is deliberately _not_ ignored, because Prisma migrations are `.sql`.
- **Public repository (ADR 0019):** the GitHub repo is public, so the whole history is visible. Never put real credentials or real personal/financial data in code, tests, docs or commit messages; test data is always fictitious. A gitleaks pre-commit hook (lefthook) and a CI job enforce this. If a secret ever leaks, rotate it; rewriting history is not enough.

## Environment notes

Development is on Windows. Node 26 is installed, and it no longer ships corepack, so install pnpm with `npm i -g pnpm`. Docker Desktop, git and gitleaks are installed. GitHub CLI is not installed. The repo is public at `github.com/diegollelis/financas-app`, with rulesets protecting `main`. Commits use the GitHub noreply e-mail (repo-local git config). Local ports: API 3333, web 5173, Postgres 5434 (3000/3001 and 5432/5433 are taken by other projects on this machine).
