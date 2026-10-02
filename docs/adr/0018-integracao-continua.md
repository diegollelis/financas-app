# 0018 — Integração contínua com GitHub Actions

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

O código precisa ser verificado a cada mudança, da mesma forma que localmente ([0013](0013-qualidade-de-codigo.md)), antes de chegar ao deploy (fase 4). O repositório vai para o GitHub. Ataques à cadeia de suprimentos via actions de terceiros (tags reapontadas para código malicioso) são um risco real, e o workflow terá acesso ao código.

## Opções consideradas

1. **Actions referenciadas por tag** (`@v7`): simples, mas a tag pode ser movida pelo dono da action para outro código.
2. **Actions fixadas por SHA do commit**: imutáveis; exigem atualização manual ou automatizada.
3. **Um job por verificação** (paralelo) **ou um job único** (sequencial): paralelo é mais rápido, mas repete a instalação em cada job; com o projeto pequeno, um job é mais simples e barato.

## Decisão

- Workflow único `.github/workflows/ci.yml`, em todo push na `main` e em todo pull request, com um job que roda, na ordem: `pnpm install --frozen-lockfile`, `format:check`, `lint`, `typecheck`, `test` e `build`. São os mesmos comandos do dia a dia.
- **Actions fixadas por SHA**, com a versão em comentário.
- **Dependabot** semanal para as actions e as dependências npm. Atualizações menores chegam agrupadas num só PR, e todo PR passa pelo CI.
- **Menor privilégio**: `permissions: contents: read` e `persist-credentials: false` no checkout.
- `concurrency` cancela execuções obsoletas do mesmo branch.
- Node lido de `.nvmrc` e pnpm do campo `packageManager`: uma única fonte de versão para local e CI.

## Consequências

- O CI não usa banco. Quando houver testes de integração com Postgres (isolamento entre espaços, fase 2), adicionar um _service container_ `postgres:18` ao job.
- `--frozen-lockfile` faz o CI falhar se o `pnpm-lock.yaml` não foi commitado junto com uma mudança de dependência.
- Se o tempo de CI crescer, dividir em jobs paralelos ou adotar cache de build (Turborepo, [0002](0002-monorepo-pnpm-workspaces.md)).
- Proteção do branch `main` (exigir CI verde para merge) fica para quando o repositório existir no GitHub.
