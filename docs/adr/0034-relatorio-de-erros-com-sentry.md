# 0034 — Relatório de erros com Sentry, sem dados pessoais

- **Status:** Aceita
- **Data:** 2026-10-04

## Contexto

Com o app em produção ([ADR 0033](0033-topologia-e-limites-do-deploy.md)), um erro só aparece se alguém reclamar ou se o log do Render for lido na hora certa. O [ADR 0009](0009-hospedagem-gratuita.md) escolheu o Sentry, e o [ADR 0012](0012-privacidade-lgpd.md) exige que nada sensível saia do app: descrições, valores, tokens e dados de quem usa.

Ao configurar o SDK (versão 11), três fatos pesaram:

- **O padrão do SDK é coletar tudo** (`dataCollection`): usuário, cookies, cabeçalhos, corpos de requisição, parâmetros de URL, dados de consultas ao banco e **as variáveis locais** da função que falhou, que incluiriam valores e descrições de lançamentos.
- **Mensagens de erro do Prisma repetem os argumentos da consulta.** Um teste com um erro real mostrou a descrição do lançamento na mensagem. O filtro padrão do Nest também grava essa mensagem no log do Render, o que já violava o ADR 0012 antes do Sentry.
- **Tokens viajam em URLs:** `/convites/:token`, `/api/invitations/:token`, `/api/auth/reset-password/:token` e `?token=` na verificação de e-mail e na redefinição de senha.

## Opções consideradas

1. **Sentry com a configuração padrão:** simples, mas manda dados financeiros e tokens.
2. **Só o log do Render:** sem conta nova, mas sem alerta, sem agrupamento e com retenção curta. Os erros do navegador nem chegariam.
3. **Sentry só para erros, com coleta desligada e limpeza antes do envio.**

## Decisão

**Opção 3**, em duas camadas:

1. **Coleta desligada na origem:** `dataCollection` com usuário, cookies, cabeçalhos, corpos, parâmetros de URL, dados de consultas, filas e variáveis locais desligados. Sem _tracing_ e sem _Session Replay_, que gravaria a tela.
2. **Limpeza antes do envio** (`beforeSend` e `beforeBreadcrumb`), em `packages/shared/src/error-reporting.ts`, usada pela API e pelo front: da requisição fica só a URL, sem _query string_ e com os tokens trocados por `[token]`. O usuário é removido, e as URLs das _breadcrumbs_ são limpas.

Na API:

- `src/instrument.ts` inicia o Sentry. O container o carrega com `node --import`, antes do app, porque no ESM é o único jeito de o SDK ver o servidor HTTP. O `main.ts` também o importa, para o `pnpm dev`.
- `AppExceptionFilter` estende o `SentryGlobalFilter`: reporta só erros inesperados (exceções HTTP, como 400 e 404, ficam de fora) e **troca a mensagem dos erros do Prisma pelo código** (ex.: `P2002`) antes do log e do envio.
- Rotas do Better Auth ficam fora do Nest: o `onAPIError` reporta só erros 500 e erros que não são do Better Auth (senha errada não é erro). Falhas no envio de e-mail e na criação do espaço pessoal também são reportadas.
- `--enable-source-maps`: as pilhas apontam para as linhas do TypeScript.

No front:

- `initErrorReporting()` antes do primeiro render, e os _callbacks_ de erro da raiz do React 19 (`onUncaughtError`, `onCaughtError`, `onRecoverableError`).

**Sem DSN, nada é enviado:** `SENTRY_DSN` (API) e `VITE_SENTRY_DSN` (front) são opcionais. Vazias ou ausentes, desligam o relatório, como em desenvolvimento e nos testes. São dois projetos no Sentry, um para a API e outro para o front, para separar os alertas.

## Consequências

- **Teste HTTP** (`apps/api/test/error-reporting.e2e.spec.ts`) com o app real. Ele prova que:
  - um erro inesperado é reportado;
  - um 404 não é reportado;
  - um erro real do Prisma chega sem os dados da consulta;
  - o cookie de sessão não sai.

  Os eventos são capturados no `beforeSend`, o último ponto antes do envio. O `sdkProcessingMetadata` interno, que tem cabeçalhos, é apagado pelo próprio SDK ao montar o envio.

- **Código-fonte nos eventos:** o Sentry anexa as linhas ao redor de cada ponto da pilha. São linhas do código, que é público, nunca dados de usuário.
- **Pilhas do front ficam minificadas.** O envio de _source maps_ ao Sentry exige um token no build do Cloudflare. Fica para quando for necessário.
- **Cota gratuita:** 5 mil erros por mês e 1 usuário. Um erro em laço pode esgotá-la. Se acontecer, avaliar uma taxa de amostragem.
- **Revisar** ao adicionar integrações do SDK (_tracing_, _replay_, IA), porque cada uma tem coleta própria, e ao mudar rotas que levam tokens: a lista fica em `TOKEN_SEGMENTS`.
- O _cron monitor_ do Sentry fica disponível para o backup agendado (próximo item).
