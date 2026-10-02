# 0026 — Login com Google e vínculo de contas

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

O [ADR 0007](0007-autenticacao-better-auth.md) previa login com Google (OAuth). Com ele surge o **vínculo de contas**: alguém que se cadastrou com e-mail e senha e depois clica em "Continuar com Google" com o mesmo e-mail deve cair na mesma conta.

Como a confirmação de e-mail ainda não é obrigatória ([ADR 0022](0022-envio-de-email.md)), isso abre o **sequestro antecipado de conta** (_account pre-hijacking_):

1. um intruso se cadastra com o e-mail da vítima e uma senha dele, sem conseguir confirmar o e-mail;
2. a vítima entra com o Google;
3. as contas se juntam e a senha do intruso continua valendo.

O Better Auth 1.7 evita isso por padrão com `requireLocalEmailVerified`: ele **recusa** o vínculo quando o e-mail local não foi confirmado. Só que isso trava a dona verdadeira, que recebe erro ao entrar com o Google. Trava também o caso comum de quem criou a senha de boa-fé e nunca confirmou o e-mail.

## Opções consideradas

1. **Recusar o vínculo** (padrão do Better Auth): seguro e sem código nosso, mas a pessoa fica sem entrar pelo Google até confirmar o e-mail.
2. **Vincular e apagar a senha antiga**: o Google prova que a pessoa é dona do e-mail. A conta é vinculada e confirmada, e a senha e as sessões que existiam antes são apagadas, expulsando um eventual intruso.

## Decisão

- **Google pelo Better Auth** (`socialProviders.google`), com `prompt: 'select_account'`, para quem tem várias contas Google escolher. As credenciais (`GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`) são **opcionais** e vêm em par: sem elas, a API funciona só com e-mail e senha, e o botão mostra "não está disponível".
- **Opção 2:** `accountLinking.requireLocalEmailVerified: false`, mais o _hook_ `databaseHooks.account.create.before`. Ao vincular uma conta externa a um usuário com e-mail **não confirmado**, o _hook_ apaga a senha (conta `credential`) e todas as sessões. Ele roda antes do vínculo ser gravado, porque logo em seguida o Better Auth marca o e-mail como confirmado. Contas com e-mail já confirmado mantêm a senha.
- **Fluxo no front:**
  1. "Continuar com Google" (login e cadastro) chama `POST /api/auth/sign-in/social`;
  2. o navegador vai para a URL do Google que a API devolveu;
  3. o Google volta para `/api/auth/callback/google` na API;
  4. a API cria a sessão e redireciona para `/`. Em caso de erro, redireciona para `/entrar?error=...`, que mostra uma mensagem.
- **Usuário novo pelo Google:** nasce com e-mail confirmado e ganha o espaço pessoal pelo mesmo _hook_ do cadastro ([ADR 0024](0024-espacos-membros-e-espaco-pessoal.md)).
- **Testes sem o Google:** o Better Auth lê o usuário do `id_token` devolvido pelo servidor de tokens do Google, sem conferir a assinatura (a resposta vem direto do Google, por HTTPS). O `fakeGoogle()` (`apps/api/test/fake-google.ts`) responde no lugar desse servidor, e os testes percorrem o fluxo inteiro: início, retorno, vínculo e sequestro. O teste de sequestro foi verificado: sem o _hook_, ele falha.

## Consequências

- Quem tinha criado senha sem confirmar o e-mail e entra com o Google perde a senha. Pode continuar pelo Google ou criar uma nova senha em "Esqueci minha senha".
- **Deploy (fase 4):** cadastrar no Google Cloud Console o URI de retorno de produção (`https://<api>/api/auth/callback/google`) e as origens; publicar a tela de consentimento (no modo "teste", só os e-mails cadastrados conseguem entrar). As credenciais de produção ficam só no painel do Render.
- Quando a confirmação de e-mail passar a ser obrigatória ([ADR 0022](0022-envio-de-email.md)), o _hook_ continua útil e inofensivo.
