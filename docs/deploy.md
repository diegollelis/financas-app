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

Sem domínio próprio, o Resend só entrega no e-mail da sua conta ([ADR 0022](adr/0022-envio-de-email.md)). A API em produção exige a chave mesmo assim.

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

## Produção atual

- Front: <https://financas-app-t2l.pages.dev>
- API: `https://financas-api-qioy.onrender.com`. Só a Function a chama; `/api/health` responde direto.

## Próximos passos

- Google OAuth de produção.
- Sentry.
- Backup do banco.
