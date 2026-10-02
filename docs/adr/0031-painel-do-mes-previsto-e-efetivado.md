# 0031 — Painel do mês: indicadores calculados na API, nas visões prevista e efetivada

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

A planilha resume cada mês com saldos, pendências e o orçamento por percentual ([fórmulas](../dominio/planilha-origem.md#indicadores-fórmulas)). O [modelo](../dominio/modelo.md#indicadores-do-painel-por-espaço-e-competência) diz que esses indicadores são calculados na API e nunca armazenados.

Ficou em aberto o problema 8 da [planilha](../dominio/planilha-origem.md#problemas-identificados-a-aplicação-deve-corrigir): os valores "Real" do orçamento aplicam o percentual sobre **todos** os créditos do mês, inclusive os que ainda não foram recebidos. Na prática, a planilha mistura duas perguntas: "como o mês vai fechar se tudo for efetivado?" e "como ele está até agora?".

## Opções consideradas

1. **Só a visão prevista**, como a planilha: simples, mas mantém o problema 8.
2. **Só a visão efetivada:** mostra a realidade, mas esconde o que já se sabe que vai entrar e sair.
3. **As duas visões lado a lado**, com nomes que não deixam dúvida.

Onde calcular:

- **No front**, a partir dos lançamentos e do orçamento que ele já carrega: menos uma rota, mas as fórmulas ficariam presas à tela.
- **Na API**, numa rota de leitura: uma requisição só, e qualquer outro cliente (exportação, relatório) recebe os mesmos números.

## Decisão

**Duas visões, calculadas na API por uma função pura compartilhada.**

- `GET /workspaces/:workspaceId/summary/:period` (qualquer membro) devolve, para a competência:
  - créditos e débitos com total, efetivado, pendente e vencido (valor e quantidade). O pendente inclui o vencido;
  - saldo **previsto** (todos os créditos − todos os débitos, o "saldo final simulado" da planilha) e **efetivado** (recebido − pago, o "saldo final");
  - o orçamento da competência, salvo, herdado ou padrão ([ADR 0030](0030-orcamento-por-competencia-com-heranca.md)), e cada destino aplicado a três bases: **meta** (renda líquida), **previsto** (todos os créditos) e **efetivado** (créditos recebidos);
  - **folga das despesas**: meta de despesas − todos os débitos (positivo = dentro da meta);
  - **resultado** previsto e efetivado: créditos − débitos − os outros destinos (investimentos, reserva e viagens). É quanto sobra depois de pagar as contas e separar as metas.
- As fórmulas ficam em `summarizePeriod`, no `packages/shared`: uma função pura, testada sem banco. A API só lê os lançamentos e o orçamento e chama a função.
- "Vencido" usa o dia de hoje em São Paulo, calculado no servidor ([ADR 0010](0010-dinheiro-e-datas.md)).
- Os dados são somados em memória: um mês pessoal tem dezenas de lançamentos, não milhares.

## Consequências

- O problema 8 fica resolvido sem perder a visão da planilha: o previsto continua lá, só que com o nome certo.
- O painel no front só exibe: não refaz conta nenhuma.
- Lançar, efetivar ou mudar o orçamento deixa o painel desatualizado. O front precisa invalidar o resumo nesses casos.
- Se um dia o volume crescer, a soma pode ir para o SQL (`GROUP BY`), mantendo o mesmo formato de resposta.
