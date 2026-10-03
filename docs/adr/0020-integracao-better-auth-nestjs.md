# 0020 — Integração do Better Auth na API NestJS

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

O [ADR 0007](0007-autenticacao-better-auth.md) escolheu o Better Auth. Para colocá-lo na API ([ADR 0014](0014-api-nest12-esm-express.md)), faltava decidir:

- **Como montar as rotas.** O Better Auth tem rotas próprias (`/api/auth/sign-up/email`, `/sign-in/email`, `/sign-out`...) e precisa ler o corpo bruto da requisição. O Nest, por padrão, instala um _parser_ JSON que consome esse corpo antes.
- **Como as tabelas de usuário seguem as convenções do [ADR 0017](0017-convencoes-de-banco-e-prisma-7.md)**: UUIDv7, nomes em `snake_case` e tabelas no plural.
- **Como testar.** Até aqui, o único teste HTTP usava um Prisma falso. Autenticação só é testada de verdade com banco.

## Opções consideradas

**Montagem**

1. **Biblioteca da comunidade** (`@thallesp/nestjs-better-auth`): já traz módulo, guard e decorators prontos. Em troca, é mais uma dependência de terceiros no caminho da segurança, e o fluxo fica escondido.
2. **Montagem manual**: o handler do Better Auth vai direto no Express, antes do parser do Nest. São poucas linhas, todas à vista.

**IDs**

1. Deixar o Better Auth gerar os IDs (texto aleatório próprio).
2. `generateId: false`: o Better Auth não envia ID, e o Prisma gera o UUIDv7 pelo `@default(uuid(7))`.

**Testes**

1. Adaptador em memória do Better Auth: dispensa banco, mas não testa o mapeamento do Prisma.
2. **Postgres real** em um banco separado (`financas_test`), localmente e no CI.

## Decisão

- **Montagem manual.** A API sobe com `bodyParser: false`, e a função `setupApp` (`apps/api/src/setup-app.ts`) aplica, nesta ordem:
  1. CORS com `credentials`, para que as rotas de autenticação também respondam ao _preflight_;
  2. o handler do Better Auth em `/api/auth/*`;
  3. os _parsers_ JSON e urlencoded para as rotas do Nest.

  O `main.ts` e os testes HTTP usam o mesmo `setupApp`, então o teste roda a mesma sequência da produção.

- **Instância como provider do Nest** (token `AUTH`, em `AuthModule`), criada com o `PrismaService` e a configuração validada. O `SessionGuard` consulta a sessão pelo cookie e responde 401 quando ela não existe. O decorator `@CurrentUser()` entrega o usuário à rota. `GET /me` é a primeira rota protegida e devolve o contrato `meResponseSchema` do shared.
- **Tabelas** `users`, `sessions`, `accounts` e `verifications`, com o formato que o Better Auth exige, mapeadas para `snake_case`. O Better Auth enxerga só os nomes do Prisma, então o mapeamento é transparente para ele. IDs **UUIDv7 via Prisma** (`generateId: false`). A senha fica só como _hash_ em `accounts.password` (provedor `credential`).
- **Cookies:** sessão em cookie `HttpOnly`. Localmente, `localhost:5173` e `localhost:3333` são o mesmo _site_ (a porta não conta), então o padrão `SameSite=Lax` basta. `trustedOrigins` aceita só o `WEB_ORIGIN`, como proteção contra CSRF.
- **Novas variáveis:** `BETTER_AUTH_SECRET` (mínimo de 32 caracteres, uma por ambiente) e `BETTER_AUTH_URL`.
- **Telemetria do Better Auth desligada** de forma explícita.
- **Testes com Postgres real:** o `globalSetup` do Vitest roda `prisma migrate deploy` no banco `financas_test`, que é criado se não existir. Cada teste limpa as tabelas antes de rodar, e os arquivos de teste da API rodam um de cada vez. No CI, um _service container_ `postgres:18-alpine` usa a mesma porta e as mesmas credenciais do `docker-compose.yml`.

## Consequências

- `pnpm test` agora precisa do Postgres local ligado (`pnpm db:up`).
- O teste de `/health` continua com o Prisma falso, porque o que ele verifica é o caso de banco fora do ar.
- **Pendência para a fase 4:** em produção, front (`*.pages.dev`) e API (`*.onrender.com`) ficam em _sites_ diferentes, e cookies `SameSite=Lax` não seriam enviados. Será preciso usar um domínio próprio (`app.` e `api.` do mesmo site) ou cookies `SameSite=None; Secure`. Revisar este ADR nesse momento. **Resolvido no [ADR 0033](0033-topologia-e-limites-do-deploy.md):** proxy `/api/*` numa Pages Function, front e API no mesmo site.
- O rate limit embutido do Better Auth só fica ativo com `NODE_ENV=production` e guarda os contadores em memória. A configuração própria é o próximo item do roadmap.
- `sessions` guarda IP e _user agent_, que são dados pessoais ([ADR 0012](0012-privacidade-lgpd.md)). Eles são apagados junto com o usuário (`ON DELETE CASCADE`).
