# 0007 — Autenticação com Better Auth

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

A aplicação será aberta ao público, com dados financeiros pessoais. Autenticação mal feita é a falha de segurança mais comum e mais grave. Ao mesmo tempo, o objetivo é aprender os conceitos (sessão, cookies, OAuth, hash de senha).

## Opções consideradas

1. **Implementar do zero (JWT + bcrypt/argon2)** — muito didático, mas alto risco: refresh token, revogação, reset de senha e proteção contra força bruta são fáceis de errar.
2. **Serviço gerenciado (Clerk, Auth0, Supabase Auth)** — seguro e rápido, mas os usuários ficam fora do nosso banco, há dependência de fornecedor e limites no plano gratuito.
3. **Better Auth** — biblioteca open source, tabelas de usuário/sessão no **nosso** PostgreSQL, adaptador Prisma, plugins para OAuth, verificação de e-mail e rate limit.

## Decisão

**Better Auth** integrado à API NestJS, com:

- login por **e-mail e senha** (com verificação de e-mail) e **Google (OAuth)**;
- **sessões em cookie** `HttpOnly`, `Secure`, `SameSite` adequado — sem token em `localStorage`;
- **recuperação de senha** e verificação de e-mail enviadas via **Resend** (plano gratuito);
- **rate limit** nas rotas de autenticação.

## Consequências

- Os dados de usuário ficam no nosso banco e podem ser exportados ou excluídos ([0012](0012-privacidade-lgpd.md)).
- O estudo foca em configurar e entender o fluxo, não em escrever criptografia.
- Cookies entre `app.` e `api.` funcionam melhor com domínio próprio; até lá, avaliar a configuração de CORS/cookies cross-site na fase 2.
- Após o login, o usuário escolhe ou cria um espaço ([0008](0008-multi-tenancy-por-espaco.md)).
