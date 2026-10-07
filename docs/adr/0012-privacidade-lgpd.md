# 0012 — Privacidade, segurança de dados e LGPD

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

A aplicação pública vai armazenar dados financeiros pessoais de terceiros, o que a coloca sob a LGPD. A planilha original contém exemplos do que circula nesses campos: dados bancários, chaves Pix e nomes de outras pessoas nas descrições.

## Decisão

**Obrigatório antes de abrir ao público (fase 5):**

- Política de privacidade e termos de uso simples, com aceite registrado no cadastro.
- **Exportação** dos dados do usuário (JSON/CSV) e **exclusão de conta** (com remoção dos espaços dos quais ele é o único dono).
- Canal de contato para solicitações do titular.

**Desde o início:**

- **Nada sensível em logs** — nunca registrar corpo de requisição, descrições, valores ou tokens; o Sentry é configurado para remover dados pessoais.
- Segredos só em variáveis de ambiente; `.env.example` versionado, `.env` nunca.
- HTTPS em todos os ambientes publicados; cookies `Secure`/`HttpOnly` ([0007](0007-autenticacao-better-auth.md)).
- Isolamento por espaço com testes ([0008](0008-multi-tenancy-por-espaco.md)).
- **Backups**: dump periódico do banco (GitHub Actions), armazenado de forma privada e criptografada, com teste de restauração.
- Planilhas e dumps reais nunca entram no repositório (`.gitignore`).

## Consequências

- Coleta mínima: só o necessário (nome, e-mail, dados financeiros que o próprio usuário lança).
- Criptografia de campos específicos (ex.: observações) pode ser avaliada depois, em novo ADR.

## Nota (fase 4, 2026-10-04)

O Google exige uma política de privacidade para publicar a tela de consentimento do login ([ADR 0026](0026-login-com-google.md)). Por isso ela foi antecipada: é a página pública `/privacidade` do front (`apps/web/src/routes/privacy.tsx`), com o contato `financas.app.contato@gmail.com`. O texto descreve só o que o app guarda hoje e deve mudar junto com ele. Enquanto exportação e exclusão de conta não existem no app (fase 5), os pedidos do titular chegam por esse e-mail. Os termos de uso, o aceite no cadastro e uma revisão jurídica continuam na fase 5.

## Nota (fase 5, 2026-10-07)

Os termos de uso com aceite, a exportação dos dados e a exclusão de conta estão decididos no [ADR 0041](0041-termos-exportacao-e-exclusao-de-conta.md). Ele muda uma regra deste ADR: um espaço de que a pessoa é dona e que tem outros membros não é apagado junto com a conta. Em vez disso, a exclusão fica bloqueada até ela resolver esse espaço.

## Nota (contato no domínio próprio, 2026-10-07)

O contato público passou a ser `financas@codelelis.com`, no domínio do [ADR 0039](0039-dominio-proprio.md). O Cloudflare Email Routing recebe as mensagens e as encaminha para a caixa do projeto, `financas.app.contato@gmail.com`, que continua recebendo quem ainda usa o endereço antigo. O Google Cloud mantém o Gmail como e-mail de suporte da tela de consentimento, porque ali o endereço precisa ser uma conta Google.
