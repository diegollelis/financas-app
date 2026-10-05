# 0035 — Backup diário do banco, criptografado, num repositório privado

- **Status:** Aceita
- **Data:** 2026-10-04

## Contexto

O plano gratuito do Neon restaura só até 6 horas atrás e guarda 1 _snapshot_ manual ([ADR 0033](0033-topologia-e-limites-do-deploy.md)). Um erro percebido no dia seguinte, ou a perda do projeto, apagaria os dados. O [ADR 0012](0012-privacidade-lgpd.md) pede um dump periódico pelo GitHub Actions, **guardado de forma privada e criptografada**, com teste de restauração.

Duas restrições vieram da conferência dos limites:

- **Artefatos de repositório público são públicos:** qualquer pessoa com acesso de leitura os baixa, ou seja, todo mundo.
- **Agendamentos de repositório público são desligados após 60 dias sem atividade.**

## Opções consideradas

**Onde rodar e guardar**

1. **Neste repositório (público):** tudo versionado junto, mas o arquivo criptografado fica público e o agendamento pode parar sozinho.
2. **Num repositório privado separado:** artefatos privados e agendamento sem o limite de 60 dias, mas a lógica ficaria fora deste repositório.
3. **Num _bucket_ (Cloudflare R2, S3):** privado e durável, mas com mais uma conta, chaves de acesso e, no R2, um cartão cadastrado.

**Como criptografar**

1. **Senha simétrica num _secret_:** quem tem acesso ao _workflow_ tem a senha e pode abrir qualquer backup.
2. **Chave pública (age):** o _runner_ só tem a chave pública, que tranca e não abre. A chave privada fica só com o dono.

## Decisão

- **Repositório privado `financas-backup`, com a lógica aqui.** Este repositório tem um _workflow_ reutilizável (`.github/workflows/backup.yml`, `workflow_call`). O privado só define o horário e os _secrets_ e o chama. A lógica fica versionada e revisada com o resto do código, e os artefatos e o agendamento ficam privados.
- **Criptografia com age (chave pública)**, ainda no _pipe_: o dump nunca existe em claro no disco do _runner_.
- **`pg_dump --format=custom`** da imagem `postgres:18-alpine` do `docker-compose.yml`, fixada pelo _digest_. O `pg_dump` precisa ser da versão do servidor ou mais novo.
- **Conexão do dono das tabelas, sem _pooler_.** O RLS está em `ENABLE`, não em `FORCE`, então o dono enxerga todas as linhas. Com o papel `financas_app`, o dump sairia sem os dados das tabelas com RLS.
- **Diário, guardado por 30 dias** como artefato.
- **Monitor de _cron_ do Sentry** ([ADR 0034](0034-relatorio-de-erros-com-sentry.md)): o _workflow_ avisa o início, o sucesso e a falha. O Sentry também avisa se o backup não rodar no horário.
- **Teste de restauração** num banco local temporário, comparando contagens com o Neon: depois da primeira execução e a cada 3 meses. Roteiro em [docs/backup.md](../backup.md).

## Consequências

- **Prova local:** o par `pg_dump`/`pg_restore` com essa imagem restaurou o banco local idêntico ao original, incluindo as políticas e o RLS ligado.
- **Chave privada:** perder a chave torna os backups inúteis, e vazá-la os expõe. Ela fica fora do GitHub, com uma cópia separada do computador.
- **Credencial de dono no repositório privado:** o _secret_ dá acesso total ao banco. Um papel só de leitura com `BYPASSRLS` seria o mínimo necessário, mas depende de o Neon permitir esse atributo. Fica como melhoria.
- **Repositório privado gasta minutos:** cerca de 1 por dia, dos 2.000 gratuitos por mês. Artefatos de cerca de 30 dias contam no armazenamento privado de 500 MB. O dump atual tem dezenas de KB.
- **O _workflow_ chamado é o da `main`** (`@main`): uma mudança aqui vale no próximo backup. Como a `main` é protegida e passa pelo CI, isso é aceitável.
- **Restauração real:** um banco novo no Neon e `pg_restore` com a conexão do dono. Antes, conferir se a restauração de até 6 horas do próprio Neon resolve.
