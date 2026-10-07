# Deploy em produção

Roteiro para colocar o app no ar com os serviços do [ADR 0009](adr/0009-hospedagem-gratuita.md), na topologia do [ADR 0033](adr/0033-topologia-e-limites-do-deploy.md):

```text
navegador ──► Cloudflare Pages (front + Function /api/*) ──► Render (API em Docker) ──► Neon (PostgreSQL 18)
```

Cada seção é feita uma vez. As telas dos serviços mudam com o tempo: se um botão tiver outro nome, procure o equivalente.

> **Segredos:** senhas, strings de conexão e chaves vão **só** no painel de cada serviço ou numa variável do terminal. Nunca em arquivo versionado, em commit, em issue ou numa conversa ([ADR 0019](adr/0019-repositorio-publico.md)). Para gerar um segredo aleatório:
>
> ```powershell
> node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
> ```

## Região

O Render não tem servidores no Brasil. A latência que mais pesa é a da API com o banco, porque uma tela faz várias consultas. Por isso, os dois ficam na mesma região: **Virginia (US East)** no Render e **AWS US East 1 (N. Virginia)** no Neon.

## 1. Neon (banco)

1. Crie a conta em <https://neon.com> (pode entrar com o GitHub).
2. **Create project:** nome `financas`, **Postgres 18** (as migrações usam `uuidv7()`), região **AWS US East 1 (N. Virginia)**.
3. No painel do projeto, clique em **Connect**. Escolha o papel dono (`neondb_owner`), **desligue** _Connection pooling_ e copie a string. Esta é a `MIGRATION_DATABASE_URL`: as migrações precisam da conexão direta, sem o _pooler_.
4. Aplique as migrações a partir da sua máquina, na raiz do repositório (PowerShell). Uma variável definida no terminal vale mais que o `.env` local:

   ```powershell
   $env:MIGRATION_DATABASE_URL = "<string do passo 3>"
   pnpm --filter @financas/api db:deploy
   Remove-Item Env:MIGRATION_DATABASE_URL
   ```

   As migrações criam as tabelas e o papel `financas_app`, ainda sem login ([ADR 0028](adr/0028-row-level-security.md)).

5. Gere uma senha para o `financas_app` (comando no início desta página). No **SQL Editor** do Neon, rode:

   ```sql
   ALTER ROLE financas_app LOGIN PASSWORD '<senha gerada>';
   ```

6. Monte a `DATABASE_URL` da API: é a string do passo 3 com **pooling ligado**, que tem `-pooler` no host, e com o usuário e a senha trocados por `financas_app` e a senha do passo 5. O _pooler_ é seguro aqui: o contexto do RLS vale só dentro de cada transação (`set_config(..., true)`).

   ```text
   postgresql://financas_app:<senha>@<host-com-pooler>/neondb?sslmode=require
   ```

## 2. Resend (e-mail)

1. Crie a conta em <https://resend.com>.
2. **API Keys → Create API Key**, com permissão _Sending access_. Guarde a chave (`re_...`): ela só aparece uma vez.

Sem domínio próprio, o Resend só entrega no e-mail da sua conta ([ADR 0022](adr/0022-envio-de-email.md)). A API em produção exige a chave mesmo assim. O domínio é verificado depois, no passo [7.3](#73-e-mail-com-o-domínio).

## 3. Render (API)

1. Crie a conta em <https://render.com> entrando com o GitHub. Dê acesso **só** ao repositório `financas-app`.
2. **New → Web Service**, escolha o repositório e preencha:

   | Campo                | Valor                 |
   | -------------------- | --------------------- |
   | Language             | Docker                |
   | Branch               | `main`                |
   | Region               | Virginia (US East)    |
   | Root Directory       | (vazio)               |
   | Dockerfile Path      | `apps/api/Dockerfile` |
   | Docker Build Context | `.`                   |
   | Instance Type        | Free                  |

3. **Environment Variables:**

   | Variável                 | Valor                                                                                   |
   | ------------------------ | --------------------------------------------------------------------------------------- |
   | `DATABASE_URL`           | a do passo 6 do Neon (papel `financas_app`, com pooler)                                 |
   | `MIGRATION_DATABASE_URL` | a do passo 3 do Neon (dono, sem pooler)                                                 |
   | `BETTER_AUTH_SECRET`     | segredo novo, só de produção                                                            |
   | `PROXY_SECRET`           | segredo novo; o mesmo valor vai depois no Cloudflare Pages                              |
   | `WEB_ORIGIN`             | URL do front no Pages, por exemplo `https://financas-app.pages.dev` (ver a nota abaixo) |
   | `BETTER_AUTH_URL`        | a mesma URL do `WEB_ORIGIN`: o navegador e o Google só enxergam o Pages                 |
   | `MAIL_TRANSPORT`         | `resend`                                                                                |
   | `RESEND_API_KEY`         | a chave do Resend                                                                       |

   `NODE_ENV=production` já vem da imagem, e o `PORT` é definido pelo Render. O login com Google fica para o passo do OAuth de produção. A API sobe sem as variáveis `GOOGLE_*`.

   > **Nota:** a URL do Pages é `https://<nome-do-projeto>.pages.dev`, e o nome só é confirmado ao criar o projeto no Cloudflare (próximo passo). Use o nome pretendido agora. Se ele estiver ocupado, troque as duas variáveis depois.

4. Em **Advanced**: _Health Check Path_ `/api/health` e _Auto-Deploy_ **After CI Checks Pass**, para só publicar o que passou no CI.
5. **Create Web Service.** O primeiro build leva alguns minutos. No log, procure `No pending migrations to apply` (as migrações já foram aplicadas no passo 4 do Neon) e `Nest application successfully started`.
6. Abra `https://<serviço>.onrender.com/api/health`. A resposta esperada é `{"status":"ok","database":"up"}`.

O endereço do Render não é usado pelo navegador. Ele é só o destino do proxy (variável `API_ORIGIN` do Pages, no próximo passo). Quando a API fica ociosa, ela dorme e leva cerca de 1 min para acordar.

## 4. Cloudflare Pages (front e proxy)

1. Crie a conta em <https://dash.cloudflare.com/sign-up>.
2. Em **Workers & Pages → Create application**, o Cloudflare mostra primeiro as opções de **Worker**. Ignore-as e clique em **Continue to Pages**, no rodapé. Depois escolha **Import an existing Git repository** e dê acesso **só** ao `financas-app`.

   > **Para saber se está no lugar certo:** a tela do Pages tem _Framework preset_ e _Build output directory_. Se aparecerem _Deploy command_ e _Preview command_, é a de um Worker: volte sem salvar. Um Worker não executa a pasta `functions/` do jeito que o proxy espera.

3. Configuração do build:

   | Campo                  | Valor                                                                                       |
   | ---------------------- | ------------------------------------------------------------------------------------------- |
   | Project name           | `financas-app`. Se o nome estiver ocupado, o Cloudflare acrescenta um sufixo na URL.        |
   | Production branch      | `main`                                                                                      |
   | Framework preset       | None                                                                                        |
   | Root directory         | `apps/web`                                                                                  |
   | Build command          | `pnpm install --frozen-lockfile --ignore-scripts --filter "@financas/web..." && pnpm build` |
   | Build output directory | `dist`                                                                                      |

   O Cloudflare instala sozinho o pnpm do campo `packageManager` do `package.json`. Não ponha `npm install -g pnpm` no comando: o build falha com `EEXIST`. O `npm install` automático não entende o `workspace:*` do pnpm, por isso é desligado com a variável abaixo.

4. Variáveis (**Settings → Variables and Secrets**):

   | Variável                  | Valor                                                                 |
   | ------------------------- | --------------------------------------------------------------------- |
   | `SKIP_DEPENDENCY_INSTALL` | `1`                                                                   |
   | `NODE_VERSION`            | `26` (mesma versão do `.nvmrc`)                                       |
   | `VITE_API_URL`            | a URL do próprio Pages, sem barra no fim. O valor é gravado no build. |
   | `API_ORIGIN`              | a URL do serviço no Render, **sem** `/api`                            |
   | `PROXY_SECRET`            | o mesmo valor do Render, do tipo _Secret_                             |

   **Digite o nome de cada variável, sem copiar e colar.** Um espaço no fim do nome não aparece no painel nem no log do build, mas o build descarta a variável sem aviso. Foi o que aconteceu com `VITE_CANONICAL_ORIGIN` na troca de domínio (7.2). Para conferir se uma variável `VITE_` entrou no build, veja se o nome do `dist/assets/index-….js` no log mudou.

5. **Save and Deploy.** Se a URL final for diferente da prevista, acerte `VITE_API_URL` aqui e faça **Retry deployment**, porque o valor só muda com um build novo. No Render, acerte também `WEB_ORIGIN` e `BETTER_AUTH_URL`.
6. Em **Settings → Builds → Branch control**, coloque **Preview branch: None**. Os _previews_ teriam outra origem, que a API recusa, e gastariam a cota de builds.
7. **Teste de ponta a ponta:**
   - a primeira resposta pode levar até 1 min, porque a API e o banco acordam;
   - cadastre-se com o e-mail da conta Resend. A verificação chega, possivelmente no spam;
   - entre de novo, crie um lançamento e abra o painel;
   - no **SQL Editor** do Neon, confira que o rate limit recebeu o IP real:

     ```sql
     SELECT split_part(key, '|', 2) AS rota, key LIKE 'no-trusted-ip%' AS sem_ip FROM rate_limits;
     ```

     `sem_ip` deve ser `false` em todas as linhas.

## 5. Google (login)

Um cliente OAuth próprio de produção, no mesmo projeto do Google Cloud do desenvolvimento. Assim cada ambiente tem o seu segredo, e revogar um não quebra o outro.

1. Em <https://console.cloud.google.com>, abra **Google Auth Platform → Clients → Create client** e escolha _Web application_:
   - **Authorized JavaScript origins:** a URL do Pages
   - **Authorized redirect URIs:** a URL do Pages + `/api/auth/callback/google`. O Google volta pelo Pages, porque `BETTER_AUTH_URL` é a URL do Pages, e a Function repassa à API.

   Copie o Client ID e o Client secret na hora: o _secret_ completo só aparece na criação.

2. Em **Branding**, preencha o nome do app (`Finanças`), o e-mail de suporte, a página inicial (URL do Pages), a política de privacidade (URL do Pages + `/privacidade`) e o domínio autorizado (o host do Pages). Não envie logo: com logo, o Google exige a verificação manual da marca.
3. Em **Audience**, clique em **Publish app**. Em modo _Testing_, só os usuários de teste entram. Os escopos são básicos (nome, e-mail e foto), então a publicação sai sem análise. O botão fica desabilitado até o _Branding_ estar completo.
4. No Render, adicione `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` do cliente de produção. As duas vão juntas. O `.env` local continua com as credenciais de desenvolvimento.
5. Teste: **Continuar com Google** com um e-mail que já tem conta. O Google é vinculado à conta (ADR 0026), e a senha continua valendo.

## 6. Sentry (relatório de erros)

O app já vem preparado ([ADR 0034](adr/0034-relatorio-de-erros-com-sentry.md)): basta criar os projetos e informar as DSNs.

1. Crie a conta em <https://sentry.io> (plano _Developer_, gratuito). Na criação da organização, escolha a região de dados **United States**, a mesma dos outros serviços citados na política de privacidade.
2. Crie dois projetos, um para cada lado, para separar os alertas:
   - plataforma **NestJS**, nome `financas-api`;
   - plataforma **React**, nome `financas-web`.

   No assistente de cada projeto, **desmarque** _Tracing_, _Session Replay_ e _Logs_. O app só envia erros, e o _Replay_ gravaria a tela com valores. Ignore os trechos de código que o assistente mostra: eles já estão no app.

3. Copie a **DSN** de cada projeto (**Project Settings → Client Keys (DSN)**). A DSN não é um segredo forte, porque só permite enviar eventos, e a do front fica visível no JavaScript do site.
4. Em **Organization Settings → Security & Privacy**, ligue **Prevent Storing of IP Addresses** e confira que **Data Scrubber** e **Use Default Scrubbers** estão ligados. É uma terceira barreira, depois das duas do app.

   Ainda na mesma página, em **Advanced Data Scrubbing → Add Rule**, crie a regra abaixo. Sem ela, o Sentry descarta o IP, mas guarda a localização aproximada (cidade, região, país) que calcula a partir dele ([issue #92201](https://github.com/getsentry/sentry/issues/92201)):

   | Campo     | Valor                                                               |
   | --------- | ------------------------------------------------------------------- |
   | Dataset   | Errors (o único tipo que o app envia e o único que aceita _Source_) |
   | Method    | Remove                                                              |
   | Data Type | Anything                                                            |
   | Source    | `$user.geo.**`                                                      |

   A regra vale só para eventos novos. No teste da etapa 7, confira que o evento não tem a seção **User → Geography**.

5. No **Render**, adicione `SENTRY_DSN` com a DSN do `financas-api`. A API reinicia sozinha.
6. No **Cloudflare Pages**, adicione `VITE_SENTRY_DSN` com a DSN do `financas-web` e faça **Retry deployment**, porque a variável é gravada no build.
7. **Teste do front:** abra o site, pressione F12 e, na aba **Console**, rode:

   ```js
   setTimeout(() => {
     throw new Error('Teste do Sentry (front)');
   });
   ```

   O erro deve aparecer em **Issues** do `financas-web` em até um minuto. O `setTimeout` é necessário: um erro lançado direto no console não passa pelo app.

8. **Teste da API:** na raiz do repositório, rode no PowerShell, trocando pela DSN do `financas-api`:

   ```powershell
   $env:SENTRY_DSN = "<DSN do financas-api>"
   pnpm --filter @financas/api exec node -e "const S=require('@sentry/nestjs');S.init({dsn:process.env.SENTRY_DSN});S.captureMessage('Teste do Sentry (API)');S.flush(5000).then(()=>console.log('enviado'))"
   Remove-Item Env:SENTRY_DSN
   ```

   A mensagem deve aparecer no `financas-api`. Esse teste confere a DSN e o projeto. A ligação com o app é coberta pelos testes automáticos (`apps/api/test/error-reporting.e2e.spec.ts`).

9. Em cada evento de teste, confira que não aparecem cookies, cabeçalhos, IP nem dados de usuário. Depois, resolva as duas _issues_ (**Resolve**).

## 7. Domínio próprio

Decisão no [ADR 0039](adr/0039-dominio-proprio.md): o app em `financas.codelelis.com`, o DNS de `codelelis.com` no Cloudflare e o proxy mantido. Faça na ordem: o login só passa a valer no novo endereço no passo 3.

### 7.1 DNS no Cloudflare e domínio no Pages

1. No Cloudflare, adicione o domínio, digitando `codelelis.com`, e escolha o plano **Free**. O caminho pode ser **Add a site** ou **Onboard a domain** na lista de domínios. Também dá para começar por **Custom domains** no Pages; nesse caso, entre as opções que aparecem, escolha **Connect a domain** (não _Transfer_ nem _Buy_).
   - Na revisão dos registros, exclua os dois **A** da raiz que vieram da Spaceship: eles são da página de domínio estacionado.
   - Os avisos sobre **MX** e **www** podem ser ignorados.
2. Os **dois nameservers** do Cloudflare ficam em **DNS → Settings → Cloudflare Nameservers**. Os da conta do projeto são `angela.ns.cloudflare.com` e `otto.ns.cloudflare.com`.
3. Na Spaceship, abra **Domain List → codelelis.com → Nameservers**, troque para **Custom** e cole os dois. Se o **DNSSEC** estiver ligado na Spaceship, desligue antes. Não ligue o DNSSEC no Cloudflare durante a troca.
4. Para conferir se a troca chegou ao registro do `.com`, rode `nslookup -type=NS codelelis.com a.gtld-servers.net`. O Cloudflare marca o domínio como **Active** pouco depois, e avisa por e-mail.
5. Em **Workers & Pages → financas-app → Custom domains → Set up a custom domain**, digite `financas.codelelis.com` e confirme. O Cloudflare cria o CNAME e o certificado. Se a raiz `codelelis.com` tiver ficado ligada ao projeto, remova: ela é de outros projetos.
6. Abra `https://financas.codelelis.com/api/health`. A resposta esperada é `{"status":"ok","database":"up"}`, depois do cold start.

### 7.2 Virar a chave

Faça os quatro itens em sequência, em poucos minutos: entre o 3 e o 4, o login fica fora do ar.

1. **Google Cloud → APIs & Services → Credentials →** cliente OAuth de produção:
   - em **Authorized JavaScript origins**, adicione `https://financas.codelelis.com`;
   - em **Authorized redirect URIs**, adicione `https://financas.codelelis.com/api/auth/callback/google`.

   Mantenha as do `pages.dev` por enquanto.

2. **Google Auth Platform → Branding:**
   - página inicial `https://financas.codelelis.com`;
   - política `https://financas.codelelis.com/privacidade`;
   - em **Authorized domains**, adicione `codelelis.com`.

   Se o Google pedir para comprovar a posse do domínio, use o Search Console (tipo **Domínio**). Ele dá um registro TXT, que você cria em **Cloudflare → DNS → Records**.

3. **Render → financas-api → Environment:** `WEB_ORIGIN` e `BETTER_AUTH_URL` = `https://financas.codelelis.com`. Salvar reinicia a API.
4. **Pages → financas-app → Settings → Variables and Secrets** (Production):
   - `VITE_API_URL` = `https://financas.codelelis.com`;
   - crie `VITE_CANONICAL_ORIGIN` = `https://financas.codelelis.com`.

   Em seguida, vá em **Deployments → Retry deployment** no último deploy: as variáveis `VITE_` só mudam com um build novo.

5. **Confira:**
   - abrir o `pages.dev` leva ao novo endereço, mantendo o caminho;
   - o login funciona por e-mail e pelo Google;
   - nas ferramentas do navegador, o cookie `__Secure-` está no host novo;
   - o Sentry não mostra erros novos.
6. Depois de alguns dias sem problemas, remova do cliente OAuth as URLs do `pages.dev`.

### 7.3 E-mail com o domínio

1. No Resend, vá em **Domains → Add Domain**, digite `codelelis.com` e escolha a região **North Virginia (us-east-1)**, a mesma da API.
   - Com o DNS no Cloudflare, o caminho automático (**Sign in to Cloudflare**) cria os registros: o DKIM em `resend._domainkey` e o subdomínio `send`, que aponta para o Resend com o MX e o SPF.
   - Espere o status **Verified**.
2. O DMARC não é do Resend: crie à mão em **Cloudflare → DNS → Records** um **TXT** `_dmarc` com `v=DMARC1; p=none;`.
3. No Render, **crie** `MAIL_FROM_EMAIL` = `nao-responda@codelelis.com`. Sem ela, a API usa o padrão `onboarding@resend.dev`. Não é preciso criar essa caixa de e-mail: enviar não depende dela. O nome do remetente vem do padrão de `MAIL_FROM_NAME` ("Finanças").
4. **Confira:** peça **Esqueci a senha** e envie um convite para um e-mail que **não** é o da conta Resend. Os dois devem chegar.
   - **No começo, podem cair no spam:** um domínio novo ainda não tem reputação. Marque "Não é spam" nas caixas que você controla; a entrega melhora com o uso.
   - Se continuar no spam depois de algumas semanas, avalie o DMARC `p=quarantine` e o texto dos e-mails.

## Problemas conhecidos

### Deploy do Render falha com "Port scan timeout"

**Sintoma:** em **Render → financas-api → Events**, o deploy aparece como **Deploy failed**. No log, a imagem foi construída e as migrações rodaram ("No pending migrations to apply."), mas logo depois vêm `Port scan timeout reached, no open ports detected` e `Timed Out`. Nenhuma mensagem da API aparece, nem as do Nest ("Mapped … route").

**O que significa:** a API não chegou a abrir a porta a tempo, e o Render desistiu. **A versão anterior continua no ar:** o app não cai, mas a mudança nova não entra. É fácil não perceber, porque o front, publicado pelo Pages, já está na versão nova. Em 2026-10-06, isso fez o cadastro novo conversar com a API antiga: as contas entravam sem confirmar o e-mail.

**O que fazer:**

1. Clique em **Manual Deploy → Deploy latest commit**. Na única vez em que aconteceu, o segundo deploy passou sem mudar nada. A imagem idêntica subia localmente em cerca de 3 segundos, então foi uma travada da instância gratuita, não do código.
2. Se falhar de novo, abra a aba **Logs** (não o log do deploy) e veja o que a API escreveu depois das migrações.
3. Para descartar um problema no código, construa e rode a imagem localmente com `NODE_ENV=production`:
   - construa com `docker build -f apps/api/Dockerfile -t financas-api .`;
   - rode com variáveis fictícias, apontando para o Postgres local (`host.docker.internal:5434`);
   - se `/api/health` responder, o código sobe.

**Para não ser pego de surpresa:** depois de cada merge que muda a API, confira em **Events** se o deploy chegou a **Deploy live** antes de testar em produção.

## Produção atual

- Front: <https://financas.codelelis.com>. O antigo <https://financas-app-t2l.pages.dev> só redireciona.
- E-mail: `nao-responda@codelelis.com`, pelo Resend, com o domínio verificado.
- API: `https://financas-api-qioy.onrender.com`. Só a Function a chama; `/api/health` responde direto.

## Próximos passos

- Backup do banco: [docs/backup.md](backup.md).
