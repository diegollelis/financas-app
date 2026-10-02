# 0022 — Envio de e-mail: Mailpit no desenvolvimento, Resend em produção

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

A verificação de e-mail e a recuperação de senha ([ADR 0007](0007-autenticacao-better-auth.md)) dependem de mandar e-mails. O [ADR 0007](0007-autenticacao-better-auth.md) escolheu o **Resend**, mas o plano gratuito tem uma restrição: **sem domínio próprio verificado, ele só envia a partir de `onboarding@resend.dev` e só para o e-mail do dono da conta**. O domínio próprio está previsto para a fase 5.

Também era preciso decidir como desenvolver e testar sem mandar e-mails de verdade e sem que os links, que carregam tokens, apareçam em logs ([ADR 0012](0012-privacidade-lgpd.md)).

## Opções consideradas

**E-mail no desenvolvimento**

1. **Resend de verdade**: o mesmo caminho da produção, mas só chega e-mail no endereço do dono da conta, e o desenvolvimento passa a depender de uma chave e da internet.
2. **Imprimir o link no console**: simples, mas é exatamente o "token em log" que o [ADR 0012](0012-privacidade-lgpd.md) proíbe.
3. **Mailpit**: um "carteiro falso" no Docker que recebe tudo e mostra numa caixa de entrada web. Funciona com qualquer e-mail fictício e nada sai da máquina.

**Exigir verificação de e-mail para entrar**

1. **Exigir já**: mais seguro, mas, até haver domínio próprio, ninguém além do dono conseguiria se cadastrar em produção.
2. **Enviar sem exigir**: o e-mail é enviado e o app mostra um aviso até a confirmação.

## Decisão

- **Uma abstração `Mailer`** (`apps/api/src/mail/`) com duas implementações escolhidas por `MAIL_TRANSPORT`:
  - **`mailpit`** (padrão): envia pela API HTTP do Mailpit (`axllent/mailpit`, no `docker-compose.yml`, caixa de entrada em http://localhost:8025);
  - **`resend`**: envia pela API HTTP do Resend, com `RESEND_API_KEY`.

  As duas usam `fetch`, sem SDK. Em `NODE_ENV=production` a API se recusa a subir sem `resend`. Nos testes, um `FakeMailer` guarda as mensagens em memória, e o teste abre o link como o usuário faria.

- **Verificação de e-mail enviada no cadastro, mas não exigida** (`requireEmailVerification: false`). A página inicial mostra um aviso com o botão "Reenviar e-mail". Ao abrir o link, o e-mail é confirmado e a pessoa já entra (`autoSignInAfterVerification`).
- **Recuperação de senha:**
  - o link do e-mail passa pela API, que confere o token e redireciona para `/redefinir-senha?token=...` no web;
  - o token vale **1 hora** e **um único uso**;
  - ao trocar a senha, **todas as sessões** do usuário são encerradas;
  - o pedido responde igual para e-mails cadastrados ou não.
- **Os links dos e-mails sempre voltam para o `WEB_ORIGIN`**: a API define o `callbackURL`, o front não. A rota da página de redefinição fica no shared (`RESET_PASSWORD_PATH`).
- **O envio não segura a resposta.** O Better Auth chama o envio, que segue em segundo plano. Assim o tempo de resposta não revela se o e-mail existe, porque um envio lento denunciaria a conta. Falhas são registradas no log **sem o conteúdo da mensagem**.
- **Modelos de e-mail** em pt-BR, com versão texto e HTML. O nome do usuário é escapado no HTML.
- **A API valida a nova senha com o schema do shared**, como já fazia no cadastro.

## Consequências

- `pnpm db:up` agora sobe também o Mailpit.
- **Até haver domínio próprio**, os e-mails de produção só chegam ao dono da conta Resend. Ao configurar o domínio (fase 5): verificar o domínio no Resend, trocar `MAIL_FROM_EMAIL` e ligar `requireEmailVerification`. Revisar então a mensagem de "e-mail já cadastrado" do cadastro ([ADR 0021](0021-sessao-e-formularios-no-front.md)).
- As rotas que enviam e-mail podem ser usadas para incomodar terceiros (pedidos em massa). O rate limit, próximo item do roadmap, deve cobri-las.
- Se o envio falhar, o usuário não fica sabendo na hora. Ele pode pedir de novo ("Reenviar e-mail" ou um novo pedido de redefinição).
