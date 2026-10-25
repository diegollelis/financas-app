# Avaliação: assistente de IA

- **Situação:** em avaliação. Nada foi decidido nem construído. Se a ideia for adiante, a decisão vira um ADR.
- **Data:** 2026-10-25

## A ideia

Integrar o app a um modelo de IA para:

- responder perguntas sobre as finanças ("quanto gastei com iFood nos últimos 3 meses?", "por que outubro fechou negativo?", "quanto o João ainda me deve?");
- lançar por texto ("gastei 45 na padaria ontem, no débito").

O dono gostaria que cada usuário usasse **a própria assinatura de IA**, sem custo de IA para o app.

## O que vale para qualquer caminho

- **O modelo nunca acessa o banco de dados.** Ele chama ferramentas, e a API as executa com as mesmas regras de hoje: sessão, espaço, papel ([ADR 0025](../adr/0025-guard-de-espaco-e-isolamento.md)) e RLS ([ADR 0028](../adr/0028-row-level-security.md)).
- **As contas ficam nas ferramentas,** com as funções que já existem e já têm testes: `summarizePeriod`, as funções da Análise e os saldos de Pessoas. O modelo só interpreta e explica, para não errar somas.
- **Escrever sempre pede confirmação.** O texto vira um rascunho de lançamento, validado pelos mesmos schemas Zod (`z.toJSONSchema`), e nada é gravado sem a pessoa aprovar.
- **Injeção de instruções:** descrições, observações e textos de importações são dados, nunca instruções. Por isso escrever exige aprovação.
- **Privacidade ([ADR 0012](../adr/0012-privacidade-lgpd.md)):** nada de perguntas e respostas em log, e o mínimo de dados em cada resposta, sem e-mails nem identificadores. Os Termos e a Política de Privacidade precisam dizer para onde os dados vão.

## Caminhos considerados

### 1. A IA dentro do app, paga pelo dono

O app chama a API de um modelo (por exemplo, a do Claude) com ferramentas, numa tela "Pergunte".

- **A favor:** a conversa acontece no app, e qualquer usuário pode usar.
- **Contra:**
  - o dono paga cada pergunta. Em outubro de 2026, na tabela da Anthropic, uma pergunta com cerca de 5 mil tokens de contexto e 500 de resposta custava perto de 3 centavos de dólar no Claude Opus 5.5, 1,5 centavo no Claude Sonnet 5.5 e menos de 0,1 centavo no Claude Haiku 5.5. Os preços mudam;
  - o app é público e gratuito, então seriam necessários um limite por usuário e um teto mensal;
  - os dados financeiros passam a ir para o fornecedor de IA por escolha do app, o que pede um consentimento explícito em cada espaço.

### 2. A chave de API do próprio usuário ("traga sua chave")

O usuário cola no app uma chave de API dele, e o app chama a IA com ela.

- **A favor:** o custo fica com o usuário.
- **Contra:**
  - **a chave de API é cobrada à parte, por uso, e não faz parte das assinaturas de consumo** (Claude Pro ou Max, ChatGPT Plus). Poucos usuários têm uma;
  - o app passaria a guardar segredos de terceiros: criptografia, nenhum log, cuidado com o Sentry ([ADR 0034](../adr/0034-relatorio-de-erros-com-sentry.md)) e um plano para vazamentos;
  - aceitar vários fornecedores multiplica o trabalho.

### 3. O app como conector da IA do usuário (servidor MCP), o preferido

O app expõe um servidor **MCP**, o protocolo aberto que Claude, ChatGPT e outros usam para conectar ferramentas externas. O usuário adiciona o Finanças como conector no Claude dele (web, desktop ou celular), faz login, escolhe o espaço e conversa por lá.

- **A favor:**
  - **usa a assinatura do usuário de forma legítima,** porque o modelo roda na conta dele. O custo de IA para o dono é zero;
  - o app não guarda chaves nem conversas;
  - o usuário escolhe levar os dados para a IA dele, com o consentimento dele;
  - a própria IA pede aprovação antes de uma ferramenta que escreve.
- **Contra:**
  - a conversa não acontece dentro do app;
  - os conectores personalizados ficam nos planos pagos das IAs, e as condições mudam;
  - o Render gratuito "dorme", e a primeira chamada depois de um tempo parado pode passar do tempo que a IA espera.

**Por que uma assinatura não serve "dentro" do app:** as assinaturas de consumo valem para os apps do próprio fornecedor. Um app de terceiros não pode usá-las para chamar o modelo, e não existe uma forma oficial de fazer isso. O caminho legítimo é o inverso: o app entra na IA do usuário (o caminho 3).

## O que o caminho 3 exigiria

- **Um endpoint MCP na API** (por exemplo, `/api/mcp`), com ferramentas que reaproveitam os serviços:
  - resumo do mês;
  - busca de lançamentos (período, categoria, estabelecimento, pessoa);
  - análise de um intervalo;
  - saldo com cada pessoa;
  - criar um lançamento;
  - talvez quitar um pendente e o recebimento parcial.
- **Login por OAuth** entre a IA e o app, porque os conectores remotos usam OAuth. Falta confirmar como o Better Auth ([ADR 0020](../adr/0020-integracao-better-auth-nestjs.md)) atende a isso.
- **Ferramentas pensadas para a IA:**
  - nomes e descrições claros;
  - respostas enxutas;
  - um espaço por vez;
  - limites de quantidade e de frequência.
- **Uma API que responde sem demora:** um plano pago no Render, ou algo que a mantenha acordada.
- **Termos e Política de Privacidade:** uma atualização, com nova versão dos Termos (`TERMS_VERSION`, [ADR 0041](../adr/0041-termos-exportacao-e-exclusao-de-conta.md)).

## Etapas sugeridas, se for adiante

1. **ADR:** caminho escolhido, privacidade, autenticação, limites e hospedagem.
2. **Conector só de leitura:** perguntas, para medir o uso real.
3. **Ferramentas que escrevem:** lançar, quitar e receber parte, com a aprovação da IA e a validação do app.
4. **Opcional:** a tela "Pergunte" dentro do app (caminho 1), se o uso justificar o custo.

## Perguntas em aberto

- Quem poderia usar: só o dono, ou todos os usuários?
- Vale pagar a hospedagem para a API não dormir?
- Quais IAs suportar primeiro: só o Claude, ou também as outras que aceitam MCP?
