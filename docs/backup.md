# Backup do banco de produção

Roteiro do backup decidido no [ADR 0035](adr/0035-backup-do-banco.md). Uma vez por dia, um workflow faz o dump do Neon, criptografa o arquivo com uma chave pública **age** e guarda o resultado como artefato num **repositório privado** por 30 dias.

```text
financas-backup (privado)                    financas-app (público)
  agendamento diário + secrets  ── chama ──►  .github/workflows/backup.yml
  artefatos (privados)          ◄── envia ──  pg_dump | age (só a chave pública)
```

> **Segredos:** a string de conexão vai só nos _secrets_ do repositório privado. A **chave privada** age fica só com você, fora do GitHub e de qualquer repositório. Sem ela, nenhum backup pode ser aberto. Se ela se perder, os backups ficam inúteis; se vazar, gere outro par de chaves e troque a pública.

## 1. Gerar o par de chaves (uma vez)

1. Instale o age no Windows:

   ```powershell
   winget install FiloSottile.age
   ```

   Feche e abra o terminal para o comando `age` aparecer.

2. Gere as chaves numa pasta **fora** do repositório:

   ```powershell
   age-keygen -o "$HOME\Documents\financas-backup-key.txt"
   ```

   O comando mostra a chave **pública** (`Public key: age1...`). Ela não é segredo: vai no GitHub. O arquivo `.txt` tem a chave **privada** (`AGE-SECRET-KEY-...`).

3. Guarde uma cópia do arquivo `.txt` num lugar seguro e separado do computador, como um gerenciador de senhas ou um pendrive guardado.

## 2. Criar o repositório privado (uma vez)

1. Em <https://github.com/new>: nome `financas-backup`, **Private**, com um README.
2. No repositório, crie o arquivo `.github/workflows/backup.yml` (**Add file → Create new file**):

   ```yaml
   # Backup diário do banco de produção do financas-app (ADR 0035 daquele repositório).
   # A lógica fica no repositório público; aqui ficam o horário, os secrets e os artefatos.
   name: Backup

   on:
     schedule:
       - cron: '17 6 * * *' # todo dia às 06:17 UTC (03:17 em Brasília)
     workflow_dispatch: # botão "Run workflow", para testes

   permissions:
     contents: read

   jobs:
     backup:
       uses: diegollelis/financas-app/.github/workflows/backup.yml@main
       with:
         age-recipient: ${{ vars.BACKUP_AGE_RECIPIENT }}
       secrets:
         DATABASE_URL: ${{ secrets.NEON_OWNER_URL }}
         SENTRY_CRON_URL: ${{ secrets.SENTRY_CRON_URL }}
   ```

3. Em **Settings → Secrets and variables → Actions**:

   | Aba       | Nome                   | Valor                                                                                     |
   | --------- | ---------------------- | ----------------------------------------------------------------------------------------- |
   | Variables | `BACKUP_AGE_RECIPIENT` | a chave pública `age1...`                                                                 |
   | Secrets   | `NEON_OWNER_URL`       | a string do dono **sem pooler** (a mesma `MIGRATION_DATABASE_URL` do Render)              |
   | Secrets   | `SENTRY_CRON_URL`      | a URL do monitor (passo 3). Pode ficar para depois: sem ela, o backup roda sem o monitor. |

## 3. Monitor no Sentry (uma vez)

O monitor funciona como um relógio de ponto: a cada execução, o backup visita a URL do monitor. Se o ponto não for batido no horário (com 30 minutos de tolerância), ou se o backup avisar que falhou, o Sentry manda um e-mail.

O monitor é criado pelo **primeiro ponto**, e não pela tela. Ao criar pela tela, o Sentry gerou um _slug_ provisório (ex.: `new-monitor-sf`) que não pôde ser editado depois, e o _slug_ é a parte da URL que identifica o monitor. Pela [API de check-in](https://docs.sentry.io/product/crons/getting-started/http/), um ponto numa URL com um _slug_ ainda inexistente, levando a configuração junto, cria o monitor com esse _slug_. O plano gratuito permite 1 monitor: se já existir outro, apague-o antes (**⋯ → Delete**).

1. Monte a URL a partir da DSN do projeto `financas-api` (**Settings → Projects → financas-api → Client Keys (DSN)**), no PowerShell:

   ```powershell
   $dsn = "<DSN do financas-api>"
   $u = [Uri]$dsn
   $url = "https://$($u.Host)/api$($u.AbsolutePath)/cron/financas-backup/$($u.UserInfo)/"; $url
   ```

2. Bata o primeiro ponto com a configuração: o mesmo horário do workflow, em UTC, 30 minutos de tolerância e 15 de duração máxima. O `Invoke-RestMethod` evita o `curl.exe`, porque o PowerShell 5.1 estraga as aspas do JSON:

   ```powershell
   $body = @{ status = 'ok'; monitor_config = @{ schedule = @{ type = 'crontab'; value = '17 6 * * *' }; timezone = 'UTC'; checkin_margin = 30; max_runtime = 15 } } | ConvertTo-Json -Depth 5
   Invoke-RestMethod -Method Post -Uri $url -ContentType 'application/json' -Body $body
   ```

   Em **Crons**, o monitor aparece com um _check-in_ OK. Em **Details**, confira **Monitor slug: `financas-backup`**.

3. Grave a URL do passo 1 (terminando em `/`, sem `?status=`) como o secret `SENTRY_CRON_URL` do passo 2 e limpe o terminal com `Remove-Variable dsn, u, url, body`.

## 4. Primeira execução

1. No `financas-backup`, abra **Actions → Backup → Run workflow**.
2. Ao terminar, a execução mostra em **Artifacts** um arquivo `financas-AAAAMMDDTHHMMSSZ`. O log mostra o tamanho.
3. Se o monitor estiver configurado, os passos "Avisa o Sentry..." do job ficam verdes (o de falha fica pulado), e o monitor mostra um novo _check-in_ OK. Sem o secret `SENTRY_CRON_URL`, esses passos são pulados e o backup roda normalmente.

## 5. Teste de restauração

Um backup só vale se a restauração funcionar. Faça este teste depois da primeira execução e, depois, a cada 3 meses. Ele usa o Postgres local (`pnpm db:up`), num banco separado que é apagado no fim.

1. Baixe o artefato da execução (um `.zip`) e extraia o `.dump.age` para uma pasta temporária, por exemplo `C:\backup-teste`.
2. Decifre com a chave privada:

   ```powershell
   cd C:\backup-teste
   age --decrypt --identity "$HOME\Documents\financas-backup-key.txt" --output financas.dump (Get-Item *.dump.age).Name
   ```

3. Restaure num banco temporário, a partir da raiz do repositório:

   ```powershell
   cd C:\dev\financas-app
   pnpm db:up
   docker compose exec -T postgres psql -U financas -d financas -c "CREATE DATABASE financas_restore"
   docker cp C:\backup-teste\financas.dump financas-postgres:/tmp/financas.dump
   docker compose exec -T postgres pg_restore --no-owner --no-privileges -U financas -d financas_restore /tmp/financas.dump
   ```

   `--no-owner` e `--no-privileges` ignoram os papéis do Neon, que não existem localmente. Numa restauração real no Neon, eles não são usados.

4. Compare as contagens. Rode a consulta abaixo no banco restaurado e a mesma no **SQL Editor** do Neon. Os números devem bater, salvo o que mudou desde o horário do backup. O SQL Editor do Neon mostra um número de linha antes das colunas, que não faz parte do resultado:

   ```powershell
   docker compose exec -T postgres psql -U financas -d financas_restore -c "SELECT (SELECT count(*) FROM users) AS usuarios, (SELECT count(*) FROM workspaces) AS espacos, (SELECT count(*) FROM transactions) AS lancamentos, (SELECT count(*) FROM categories) AS categorias, (SELECT count(*) FROM budget_configs) AS orcamentos, (SELECT count(*) FROM pg_policies) AS politicas_rls"
   ```

5. Apague tudo o que tem dados em claro:

   ```powershell
   docker compose exec -T postgres rm /tmp/financas.dump
   docker compose exec -T postgres psql -U financas -d financas -c "DROP DATABASE financas_restore"
   Remove-Item -Recurse C:\backup-teste
   ```

## Restaurar de verdade

Se o banco de produção se perder: crie um banco novo no Neon (ou um _branch_), restaure o dump decifrado com `pg_restore --dbname "<string do dono>" financas.dump` e aponte as variáveis do Render para ele. Antes disso, confira se a restauração de um ponto no tempo do próprio Neon (até 6 horas atrás no plano gratuito) não resolve.
