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
