# 0028 — Row Level Security como segunda barreira entre espaços

- **Status:** Aceita (desenho e prova de conceito; aplicação a partir da fase 3)
- **Data:** 2026-10-02

## Contexto

O isolamento entre espaços hoje depende de código ([ADR 0025](0025-guard-de-espaco-e-isolamento.md)): um guard na rota, serviços que sempre filtram por `workspace_id` e testes de isolamento. Basta uma consulta nova esquecer o filtro para dados de um espaço aparecerem em outro. No Protheus, seria um `SELECT` sem `xFilial()`.

O [ADR 0008](0008-multi-tenancy-por-espaco.md) previu o **Row Level Security (RLS)** do PostgreSQL como segunda barreira. Com ele, o próprio banco só devolve as linhas do espaço ativo, mesmo que a consulta não filtre.

O estudo levou a três constatações:

1. **A API conecta como superusuário.** Localmente e no CI, o usuário `financas` é superusuário e tem `BYPASSRLS`, e para ele o PostgreSQL **ignora qualquer política**. RLS exige que a API use um papel próprio, sem esses poderes.
2. **As tabelas atuais não se encaixam bem no modelo.** `members` é lida "por usuário" (a lista dos seus espaços), e `invitations` é procurada pelo token, antes de se saber o espaço. Elas precisariam de exceções. As tabelas de negócio da fase 3 (categorias, lançamentos, orçamento) são o caso ideal: sempre acessadas dentro de um espaço.
3. **Uma armadilha do `current_setting`:** depois que uma transação define a configuração local, ela continua existindo na sessão com valor `''`. Converter `''` para `uuid` é erro. A política precisa de `NULLIF(..., '')`.

## Opções consideradas

1. **Aplicar já em `invitations` e `members`**: proteção real hoje, mas com exceções (busca por token, lista por usuário) justamente nas tabelas que menos se beneficiam.
2. **Desenho e prova de conceito agora, aplicação com a primeira tabela de negócio (Categorias)**: o mecanismo fica testado e documentado, e cada tabela de negócio nasce protegida.
3. **Adiar sem desenho**: mais rápido, mas a decisão chegaria junto com a pressão da fase 3.

## Decisão

**Opção 2.** O desenho, que será aplicado com Categorias:

- **Dois papéis no banco:**
  - o **dono** (atual `financas`; no Neon, o dono do banco) roda as migrações e é dono das tabelas;
  - **`financas_app`**, usado pela API em tempo de execução: `LOGIN NOSUPERUSER NOBYPASSRLS`, com `SELECT/INSERT/UPDATE/DELETE` nas tabelas e privilégios padrão para as tabelas futuras.
  - O `DATABASE_URL` da API passa a usar `financas_app`. As migrações usam uma URL própria, do dono (no `prisma.config.ts`). O mesmo vale no CI (criação do papel no _setup_ dos testes) e no Neon (papel criado no console).
- **Contexto do espaço por transação:** toda operação dentro de um espaço roda numa transação que começa com `SELECT set_config('app.workspace_id', <id>, true)`. O `true` torna a configuração **local à transação**: ela some no `COMMIT` e não vaza para o próximo uso da conexão. Isso funciona também com o _pooler_ do Neon (PgBouncer em modo transação).
- **Na API:** uma extensão do Prisma Client, `prisma.forWorkspace(workspaceId)`, envolve cada consulta nessa transação. Os serviços de recursos do espaço usam `this.prisma.forWorkspace(membership.workspaceId)`, com o id que o `WorkspaceMemberGuard` já validou. O filtro explícito por `workspace_id` **continua** no código: o RLS é a segunda barreira, não a primeira.
- **Política padrão** de cada tabela de negócio:
  ```sql
  ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;
  CREATE POLICY workspace_isolation ON <tabela>
    USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
  ```
  - **Falha fechada:** sem espaço no contexto, nenhuma linha aparece.
  - O `WITH CHECK` impede **gravar** linhas em outro espaço.
  - Sem `FORCE ROW LEVEL SECURITY`: o dono das tabelas (as migrações, inclusive as de dados) não é filtrado.
- **Fora do RLS, por enquanto:** as tabelas do Better Auth, `workspaces`, `members`, `invitations` e `rate_limits`. Elas são acessadas fora de um contexto de espaço e seguem protegidas pelo guard e pelos testes de isolamento. A decisão será revista se elas ganharem acessos novos.
- **Prova de conceito permanente** (`apps/api/test/rls-proof.e2e.spec.ts`), que roda no CI com o mesmo Prisma e o mesmo adaptador da API. Ela prova que:
  1. uma consulta sem filtro só vê o espaço ativo;
  2. sem contexto, nada aparece;
  3. gravar em outro espaço é recusado pelo banco;
  4. o contexto não vaza para a transação seguinte na mesma conexão;
  5. um superusuário ignora a política.

  A armadilha do `NULLIF` foi confirmada: sem ele, os casos 2 e 4 quebram com `invalid input syntax for type uuid: ""`.

## Consequências

- Primeiro item da fase 3: criar o papel `financas_app`, separar as URLs (API e migrações), implementar `forWorkspace` e aplicar a política em `categories`. Cada tabela de negócio seguinte nasce com `workspace_id`, a política e um teste mostrando que uma consulta sem filtro, pela API, não vê outro espaço.
- Toda requisição dentro de um espaço passa a rodar numa transação, com dois comandos a mais. O custo é pequeno e será medido quando a fase 3 existir.
- Erros de RLS aparecem como erro de banco (ex.: `new row violates row-level security policy`). Se um desses acontecer em produção, é sinal de um bug que o filtro do código deixou passar: deve ir para o log e para o Sentry (fase 4).

## Notas de implementação (fase 3)

- **O papel nasce numa migração** (`20261002193322_add_app_role`): `financas_app` é criado **sem login e sem senha**, porque a migração é pública. Ela concede `SELECT/INSERT/UPDATE/DELETE` nas tabelas de `public`, define privilégios padrão para as tabelas futuras e tira o acesso a `_prisma_migrations`. Sem `TRUNCATE` e sem DDL.
- **Cada ambiente habilita o login com a própria senha:** `ALTER ROLE financas_app LOGIN PASSWORD '...'`. Localmente, `pnpm db:app-role` (senha `financas_app`, só desta máquina). Nos testes e no CI, o `globalSetup` faz isso sozinho. No Neon, o comando roda no editor SQL do console, com uma senha gerada; **não** se cria o papel pela tela de papéis, porque esses ganham o grupo `neon_superuser`.
- **Variáveis:** `DATABASE_URL` (API, `financas_app`) e `MIGRATION_DATABASE_URL` (Prisma CLI, dono). A API não conhece a segunda.
- **`prisma.forWorkspace(id)`** é uma extensão de consulta (`$allOperations`, que cobre também `$queryRaw`) que roda cada operação numa transação em lote: `set_config(..., true)` e depois a consulta. Por já ser uma transação, não se abre `$transaction` sobre o client devolvido. Prova em `apps/api/test/prisma-for-workspace.e2e.spec.ts`.
- **Testes:** a API dos testes conecta como `financas_app`, igual à produção. A limpeza (`resetDatabase()`) e a preparação de cenários usam um client do dono (`ownerClient()` em `apps/api/test/db.ts`).
