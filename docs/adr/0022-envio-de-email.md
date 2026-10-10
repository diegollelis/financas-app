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
- **Domínio (2026-10-06):** o domínio verificado no Resend é `codelelis.com`, e o remetente `nao-responda@codelelis.com` ([ADR 0039](0039-dominio-proprio.md)). Exigir a verificação de e-mail fica para um PR próprio.
- As rotas que enviam e-mail podem ser usadas para incomodar terceiros (pedidos em massa). O rate limit, próximo item do roadmap, deve cobri-las.
- Se o envio falhar, o usuário não fica sabendo na hora. Ele pode pedir de novo ("Reenviar e-mail" ou um novo pedido de redefinição).

## Nota (verificação obrigatória, 2026-10-06)

Com o domínio verificado no Resend ([ADR 0039](0039-dominio-proprio.md)), os e-mails chegam a todos, e a verificação passou a ser obrigatória (`requireEmailVerification`).

- **O cadastro não abre sessão.** A tela troca o formulário por "Confira seu e-mail", com "Reenviar e-mail" e "Usar outro e-mail". O link de confirmação entra na conta (`autoSignInAfterVerification`).
- **Cadastro com um e-mail que já tem conta:** a resposta é igual à de um cadastro novo, no formato e no tempo; o Better Auth calcula o hash de uma senha mesmo assim. A mensagem "Já existe uma conta com este e-mail", que revelava quais e-mails têm conta, deixou de existir.
  - O dono da conta recebe "Você já tem uma conta", com links para entrar e para redefinir a senha (`onExistingUserSignUp`).
  - Esse e-mail não verifica nada nem abre sessão.
- **Login com a senha certa e o e-mail não verificado:** responde 403 `EMAIL_NOT_VERIFIED` e envia um link novo (`sendOnSignIn`). É o caminho de quem perdeu o primeiro e-mail. Com a senha errada, responde 401 e não envia nada: a senha é conferida antes.
- **Redefinir a senha verifica o e-mail** (`onPasswordReset`): o link foi para aquele endereço, então quem o abriu é o dono, e não precisa de um segundo e-mail.
- **O link volta à página de onde a pessoa veio.** O formulário envia o `?voltar=` como `callbackURL`, por exemplo `/convites/:token`. A API só aceita um caminho interno (`safeReturnTo`, agora em `packages/shared`); qualquer outro vira `/`.
- **Sessões abertas antes da mudança** continuam valendo até expirar, e o aviso "Confirme seu e-mail" continua para elas. No próximo login por senha, a confirmação é exigida.
- **Log:** o Better Auth registra em nível `info` o e-mail de um cadastro repetido. O nível ficou fixado em `warn`, o padrão dele, para uma atualização não passar a gravar e-mails ([ADR 0012](0012-privacidade-lgpd.md)).

## Nota (e-mails com a marca, 2026-10-10)

Os e-mails passaram a ter a identidade do CodeLélis Finanças ([ADR 0043](0043-identidade-visual-codelelis.md)), num layout único. Ele está em `mailTemplates`, em `apps/api/src/mail/templates.ts`, que recebe o `WEB_ORIGIN`.

- **A marca fica no remetente, não no assunto.** O padrão de `MAIL_FROM_NAME` passou a ser "CodeLélis Finanças", e os assuntos ficaram curtos e começam pela ação ("Confirme seu e-mail", "Redefina sua senha"). No celular, a caixa de entrada mostra só uns 35 caracteres do assunto, e o remetente aparece sempre.
- **Layout:**
  - **Logo:** a oficial, no topo, servida pelo próprio site (`/brand/logo-horizontal-light.png`). O texto alternativo é o nome da marca, para os clientes que bloqueiam imagens.
  - **Botão:** no azul da marca (`#0066ff`), com contraste de 4,8:1 com o texto branco. Abaixo dele, o endereço do link em texto, para quando o botão não abre.
  - **Rodapé:** o motivo do e-mail, o aviso de que o endereço não recebe respostas e os links para o app e para a Política de privacidade.
  - **Tema e prévia:** só o tema claro, declarado com `color-scheme`, e uma linha de prévia escondida para a caixa de entrada.
- **O convite diz o acesso com as mesmas palavras das telas:** `roleLabels` e `roleDescriptions` saíram do app web para `packages/shared`, e o e-mail usa os dois ("Seu acesso: Pode editar. Lança, efetiva e muda…").
- **Sem rastreamento:** nenhum pixel de abertura nem link rastreado ([ADR 0012](0012-privacidade-lgpd.md)). Um teste confere que todo link e toda imagem apontam para o app ou para o link do botão.
