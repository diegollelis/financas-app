# 0033 — Topologia do deploy e limites dos planos gratuitos

- **Status:** Aceita
- **Data:** 2026-10-03

## Contexto

O [ADR 0009](0009-hospedagem-gratuita.md) escolheu Cloudflare Pages, Render, Neon, Resend e Sentry, e pediu para conferir os limites gratuitos antes do deploy, porque eles mudam com frequência. A conferência está abaixo.

Também havia uma pendência no [ADR 0020](0020-integracao-better-auth-nestjs.md): o front em `*.pages.dev` e a API em `*.onrender.com` ficam em **sites diferentes**, porque os dois sufixos estão na _Public Suffix List_ (cada subdomínio conta como um site próprio). O cookie de sessão `SameSite=Lax` não iria nas chamadas do front para a API.

### Limites conferidos em 2026-10-03

| Serviço                                                                                                            | Plano gratuito                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/)                                       | 500 builds/mês, 1 build por vez, 20 min por build, 20.000 arquivos (25 MiB cada). Arquivos estáticos são ilimitados.                                                                                                                                                                                                                                                                                             |
| [Pages Functions / Workers](https://developers.cloudflare.com/workers/platform/limits/)                            | 100.000 requisições/dia (somadas com Workers, zeram à meia-noite UTC), 10 ms de CPU por requisição, 50 subrequisições por requisição. Acima do limite: erro 1027. Esperar a resposta do Render não conta como CPU.                                                                                                                                                                                               |
| [Render](https://render.com/docs/free) (web service free)                                                          | 750 horas/mês por workspace (dá para um serviço o mês todo), 512 MB de RAM e 0,1 CPU, hiberna após 15 min sem tráfego e leva ~1 min para acordar, pode ser reiniciado a qualquer momento, sem disco persistente nem shell. [5 GB de banda de saída/mês](https://render.com/docs/outbound-bandwidth) no workspace Hobby. **[Sem _pre-deploy command_](https://render.com/docs/deploys)** (só nos planos pagos).   |
| [Neon](https://neon.com/pricing)                                                                                   | 1 GB por projeto, 100 CU-horas/mês por projeto, até 2 CU, suspende após 5 min ocioso (não dá para desligar), 10 branches, 5 GB de saída/mês, histórico de restauração de 6 h e 1 snapshot manual. Acima do limite, o compute é suspenso ou as escritas bloqueadas; nada é apagado. [PostgreSQL 18 suportado](https://neon.com/docs/postgresql/postgres-version-policy).                                          |
| [Resend](https://resend.com/pricing)                                                                               | 3.000 e-mails/mês, 100/dia, 30 dias de retenção. [Sem domínio verificado, `onboarding@resend.dev` só entrega no e-mail do dono da conta](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain) (já previsto no [ADR 0022](0022-envio-de-email.md)).                                                                                                                                                |
| [Sentry](https://sentry.io/pricing/) (Developer)                                                                   | 5 mil erros/mês, 1 usuário, 5 M spans, 50 replays, 30 dias de retenção, 1 cron monitor.                                                                                                                                                                                                                                                                                                                          |
| [GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) (repositório público) | Minutos ilimitados nos runners padrão. Artefatos ficam 90 dias e [qualquer pessoa com leitura do repositório os baixa](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts), ou seja, todo mundo. [Agendamentos são desligados após 60 dias sem atividade no repositório](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows). |

Nenhum limite invalida a escolha do ADR 0009. Para um app de estudo com poucos usuários, os gargalos reais são o cold start do Render, os 100 e-mails/dia do Resend e os 100.000 pedidos/dia das Functions.

## Opções consideradas (cookies entre front e API)

1. **Cookie `SameSite=None; Secure`**: só configuração. Mas Safari (inclusive todo navegador no iPhone) e Firefox bloqueiam ou isolam cookies de terceiros: o login quebraria nesses navegadores.
2. **Domínio próprio já** (`app.` e `api.` no mesmo site): resolve de forma definitiva, mas tem custo anual e depende do Registro.br. Está previsto para a fase 5.
3. **Proxy numa Pages Function**: o front encaminha `/api/*` para o Render. Para o navegador, só existe um site, o do Pages, e o cookie `Lax` continua valendo. Custa uma Function por chamada da API (dentro das 100.000/dia) e um salto de rede a mais.

## Decisão

**Opção 3.** A topologia de produção fica:

```text
navegador ──► Cloudflare Pages (https://<projeto>.pages.dev)
                ├─ arquivos do front (estáticos, ilimitados)
                └─ /api/*  ─► Pages Function ─► Render (API em Docker) ─► Neon (PostgreSQL 18)
```

É como no Protheus, quando o cliente fala só com o servidor _broker_ e não sabe em qual _slave_ a requisição cai: o navegador fala só com o Pages, e o Pages repassa.

Quando houver domínio próprio (fase 5), a Function pode continuar ou ser trocada por `api.` no mesmo site. Basta mudar as variáveis de ambiente.

## Consequências

- **URLs:** o front chama a API pelo próprio endereço (`VITE_API_URL` = URL do Pages + `/api`). `WEB_ORIGIN` e `BETTER_AUTH_URL` da API passam a ser a URL do Pages, porque é ela que o navegador e o Google veem (callback do OAuth, links dos e-mails). A Function retira o prefixo antes de repassar ou a API passa a responder sob `/api`; decidir no PR do proxy.
- **IP real do cliente (rate limit, [ADR 0023](0023-rate-limit-autenticacao.md)):** o Render passa a ver o IP do Cloudflare, não o do usuário. Quando a Function chama uma origem fora do Cloudflare, o Cloudflare preenche `CF-Connecting-IP` com o IP do cliente ([documentação](https://developers.cloudflare.com/fundamentals/reference/http-headers/)), mas qualquer um pode chamar o Render direto e forjar esse cabeçalho. Por isso a Function envia também um segredo compartilhado (variável nos dois lados), e a API só confia no IP repassado quando o segredo confere. Se a API vai também recusar quem chega sem o segredo (exceto o `/health` do Render) fica para o PR do proxy.
- **Migrações:** sem _pre-deploy command_ no plano free, o container roda `prisma migrate deploy` ao iniciar, antes de subir a API. A migração usa a URL do dono do banco; a API, a do papel `financas_app` ([ADR 0028](0028-row-level-security.md)).
- **Cold start em dobro:** a API dorme após 15 min e o Neon após 5 min. A primeira requisição pode levar mais de 1 min. O front já precisa de um carregamento amigável ([ADR 0009](0009-hospedagem-gratuita.md)), e o timeout da Function não pode ser menor que isso.
- **E-mail:** até o domínio próprio, verificação, redefinição de senha e convites só chegam ao dono da conta Resend. Outros usuários entram por Google ou sem verificar o e-mail. Limitação conhecida e aceita.
- **Backup:** artefatos do Actions são públicos neste repositório. O dump deve ser criptografado antes de sair do runner, ou ficar fora do GitHub ([ADR 0012](0012-privacidade-lgpd.md)). Como o agendamento para após 60 dias sem atividade, o workflow precisa ser monitorado (o cron monitor do Sentry serve para isso).
- **Ordem da fase 4**, um PR por passo: (1) proxy e configuração de produção da API (IP confiável, cookies `Secure`), com testes; (2) Dockerfile da API, Neon com o papel `financas_app` e serviço no Render; (3) front no Pages com a Function; (4) Google OAuth de produção; (5) Sentry; (6) backup e teste de restauração.
- **Revisar este ADR** quando houver domínio próprio ou se algum limite acima for atingido.
