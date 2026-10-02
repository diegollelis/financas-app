# 0023 — Rate limit nas rotas de autenticação

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

Sem limite, qualquer pessoa pode testar milhares de senhas por minuto em `/sign-in/email` (força bruta), criar contas em massa ou usar as rotas que enviam e-mail ([ADR 0022](0022-envio-de-email.md)) para lotar a caixa de entrada de alguém. O [ADR 0007](0007-autenticacao-better-auth.md) já previa rate limit nas rotas de autenticação.

O Better Auth tem um limitador embutido. Por padrão, ele só funciona em produção, guarda os contadores em memória e identifica o cliente pelo cabeçalho `X-Forwarded-For`.

## Opções consideradas

**Onde limitar**

1. **`@nestjs/throttler`** na API inteira: genérico, mas as rotas do Better Auth não passam pelo Nest (elas ficam montadas direto no Express, [ADR 0020](0020-integracao-better-auth-nestjs.md)).
2. **Limitador do Better Auth**: conhece as próprias rotas e permite uma regra por rota.

**Onde guardar os contadores**

1. **Memória**: rápido e sem tabela, mas zera a cada reinício. No plano gratuito do Render a API dorme e reinicia com frequência, e um atacante ganharia um contador novo a cada reinício.
2. **Banco** (tabela `rate_limits`): sobrevive a reinícios e funciona com mais de uma instância. O custo é uma consulta a mais por requisição de autenticação.

## Decisão

- **Limitador do Better Auth, ligado em todos os ambientes** (desenvolvimento e testes também), para o comportamento ser o mesmo em todo lugar e poder ser testado.
- **Contadores no banco**, na tabela `rate_limits`: uma linha por IP + rota. É uma tabela técnica, sem `created_at`/`updated_at`; `last_request` (milissegundos desde 1970, como o Better Auth grava) faz esse papel.
- **Regras, por IP e por rota.** O contador zera quando passa o período inteiro sem tentativas:

  | Rota                                                  | Limite             |
  | ----------------------------------------------------- | ------------------ |
  | `/sign-in/email`                                      | 5 por minuto       |
  | `/sign-up/email`                                      | 3 por minuto       |
  | `/request-password-reset`, `/send-verification-email` | 3 a cada 5 minutos |
  | `/reset-password` e `/reset-password/*`               | 5 a cada 5 minutos |
  | demais rotas de `/api/auth`                           | 100 por minuto     |

- **Resposta 429 com `X-Retry-After`** (em segundos). O CORS expõe esse cabeçalho, e o front mostra "Muitas tentativas. Tente de novo em N segundos/minutos."
- **Nos testes**, cada cliente HTTP (`http()`) recebe um IP fictício diferente, da faixa de documentação `198.51.100.0/24`. Os testes de rate limit fixam o IP com `http({ ip })`.

## Consequências

- **Pendência obrigatória da fase 4 (deploy):** o limitador só separa os clientes se conseguir o IP real. Sem um `X-Forwarded-For` confiável, ele cai num **contador único compartilhado** (chave `no-trusted-ip`). Foi o que aconteceu no teste local, sem proxy. Em produção, isso permitiria que um atacante bloqueasse o login de todo mundo. Também não basta aceitar qualquer `X-Forwarded-For`: o cliente pode forjar o cabeçalho. No deploy, é preciso:
  - descobrir que cabeçalho o proxy do Render preenche com o IP do cliente;
  - configurar `advanced.ipAddress` (`ipAddressHeaders` ou `trustedProxies`);
  - conferir na tabela `rate_limits` que as chaves têm o IP real.
- O limite é por IP. Pessoas atrás do mesmo IP (rede de empresa, 4G) dividem o contador, e um atacante com muitos IPs não é contido. Um limite por e-mail (ex.: pedidos de redefinição para a mesma conta) fica como evolução, se for necessário.
- Rotas fora do Better Auth (futuras rotas de negócio do Nest) não estão cobertas. Avaliar `@nestjs/throttler` quando houver rotas públicas sensíveis.
