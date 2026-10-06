# Architecture Decision Records

Decisões de arquitetura do projeto ([por que usamos ADRs](0001-registrar-decisoes-com-adr.md)). Para uma nova decisão, copie o [template](0000-template.md), use o próximo número e adicione-a a este índice.

| #                                                     | Decisão                                                                           | Status |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| [0001](0001-registrar-decisoes-com-adr.md)            | Registrar decisões com ADRs                                                       | Aceita |
| [0002](0002-monorepo-pnpm-workspaces.md)              | Monorepo com pnpm workspaces                                                      | Aceita |
| [0003](0003-frontend-react-vite-typescript.md)        | Frontend: React + Vite + TypeScript                                               | Aceita |
| [0004](0004-backend-nestjs.md)                        | Backend: NestJS                                                                   | Aceita |
| [0005](0005-banco-postgresql-prisma.md)               | Banco: PostgreSQL + Prisma                                                        | Aceita |
| [0006](0006-validacao-zod-compartilhada.md)           | Validação com Zod compartilhado                                                   | Aceita |
| [0007](0007-autenticacao-better-auth.md)              | Autenticação com Better Auth                                                      | Aceita |
| [0008](0008-multi-tenancy-por-espaco.md)              | Multi-tenancy por Espaço                                                          | Aceita |
| [0009](0009-hospedagem-gratuita.md)                   | Hospedagem gratuita                                                               | Aceita |
| [0010](0010-dinheiro-e-datas.md)                      | Representação de dinheiro e datas                                                 | Aceita |
| [0011](0011-idioma-do-codigo.md)                      | Idioma do código, UI e documentação                                               | Aceita |
| [0012](0012-privacidade-lgpd.md)                      | Privacidade, segurança de dados e LGPD                                            | Aceita |
| [0013](0013-qualidade-de-codigo.md)                   | Qualidade de código: TypeScript estrito, ESLint, Prettier e Vitest                | Aceita |
| [0014](0014-api-nest12-esm-express.md)                | API: NestJS 12 em ESM, adaptador Express e configuração validada                  | Aceita |
| [0015](0015-shared-como-codigo-fonte.md)              | `packages/shared` consumido como código-fonte TypeScript                          | Aceita |
| [0016](0016-estrutura-do-front.md)                    | Estrutura do front: shadcn/ui com Radix, React Router 8 e cliente de API validado | Aceita |
| [0017](0017-convencoes-de-banco-e-prisma-7.md)        | Convenções de banco e uso do Prisma 7                                             | Aceita |
| [0018](0018-integracao-continua.md)                   | Integração contínua com GitHub Actions                                            | Aceita |
| [0019](0019-repositorio-publico.md)                   | Repositório público: proteção contra vazamento de segredos e dados pessoais       | Aceita |
| [0020](0020-integracao-better-auth-nestjs.md)         | Integração do Better Auth na API NestJS                                           | Aceita |
| [0021](0021-sessao-e-formularios-no-front.md)         | Sessão, rotas protegidas e formulários no front                                   | Aceita |
| [0022](0022-envio-de-email.md)                        | Envio de e-mail: Mailpit no desenvolvimento, Resend em produção                   | Aceita |
| [0023](0023-rate-limit-autenticacao.md)               | Rate limit nas rotas de autenticação                                              | Aceita |
| [0024](0024-espacos-membros-e-espaco-pessoal.md)      | Espaços, membros e o espaço pessoal                                               | Aceita |
| [0025](0025-guard-de-espaco-e-isolamento.md)          | Guard de espaço, papéis e testes de isolamento                                    | Aceita |
| [0026](0026-login-com-google.md)                      | Login com Google e vínculo de contas                                              | Aceita |
| [0027](0027-convites-por-email.md)                    | Convite de membros por e-mail                                                     | Aceita |
| [0028](0028-row-level-security.md)                    | Row Level Security como segunda barreira entre espaços                            | Aceita |
| [0029](0029-lancamentos-e-integridade-no-banco.md)    | Lançamentos: regras garantidas pelo banco e status derivado                       | Aceita |
| [0030](0030-orcamento-por-competencia-com-heranca.md) | Orçamento por competência, herdado da última competência salva                    | Aceita |
| [0031](0031-painel-do-mes-previsto-e-efetivado.md)    | Painel do mês: indicadores calculados na API, nas visões prevista e efetivada     | Aceita |
| [0032](0032-graficos-sem-biblioteca.md)               | Gráficos sem biblioteca, com paleta validada                                      | Aceita |
| [0033](0033-topologia-e-limites-do-deploy.md)         | Topologia do deploy (proxy no Cloudflare Pages) e limites dos planos gratuitos    | Aceita |
| [0034](0034-relatorio-de-erros-com-sentry.md)         | Relatório de erros com Sentry, sem dados pessoais                                 | Aceita |
| [0035](0035-backup-do-banco.md)                       | Backup diário do banco, criptografado, num repositório privado                    | Aceita |
| [0036](0036-design-mobile-first.md)                   | Interface mobile first, sóbria, com regras numa skill do projeto                  | Aceita |
| [0037](0037-analise-de-periodos.md)                   | Análise de períodos: somas na API, filtros no cliente, gráficos em SVG próprio    | Aceita |
