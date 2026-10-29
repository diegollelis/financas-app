# 0063 — Fechamento do mês: fechar e reabrir uma competência

- **Status:** Aceita
- **Data:** 2026-10-29

## Contexto

Qualquer competência aceita mudanças a qualquer momento, mesmo depois de tudo pago, recebido e conferido. Uma edição por engano num mês passado muda os números sem aviso. O dono quer **fechar o mês** como trava de segurança, com uma forma de **reabrir** para uma correção.

O levantamento está em [docs/avaliacoes/fechamento-do-mes.md](../avaliacoes/fechamento-do-mes.md). Três pontos pesaram:

- o resumo de um mês só usa as linhas dele, sem saldo carregado;
- muitos caminhos escrevem em meses passados, até um GET (`materialize`);
- algumas configurações do espaço mudam o passado sem tocar num lançamento.

## Opções consideradas

1. **"Fechado até":** uma data limite no espaço, como o `MV_DATAFIN` do Protheus. É simples, mas reabrir um mês antigo reabre todos os seguintes.
2. **Mês a mês, só no serviço.** Cada competência fecha sozinha, e cada caminho confere a trava. Um caminho novo esquecido passaria.
3. **Mês a mês, no serviço e no banco,** com histórico de quem fechou e quem reabriu.

## Decisão

Opção 3.

- **O fechamento é por competência** (`period_closings`, com RLS, [ADR 0028](0028-row-level-security.md)): quem fechou e quando, e, ao reabrir, quem reabriu, quando e por quê.
  - Reabrir não apaga a linha. Fechar de novo cria outra, e a sequência fica como histórico.
  - Um índice único parcial deixa no máximo um fechamento em vigor (`reopened_at IS NULL`) por espaço e competência.
- **Quem pode:** EDITOR fecha e reabre. Reabrir exige um motivo, que fica no histórico.
- **Fechar exige o mês sem pendências** (409 `PERIOD_HAS_PENDING`, com a lista).
  - A exceção é o a receber ou a pagar sem vencimento numa categoria "Nem renda nem gasto" (`undatedReceivable`/`undatedPayable`, [ADR 0057](0057-receber-parte-e-a-receber-sem-data.md)): um empréstimo sem prazo pode durar meses, e ele não impede o fechamento.
  - Num mês fechado, esse lançamento só aceita o recebimento ou pagamento parcial (até do valor inteiro), porque a parte nasce no mês do dia informado e o pendente sai do previsto de qualquer forma.
- **Ao fechar, o orçamento herdado é salvo no próprio mês** (`INHERITED` vira `SAVED`). Assim, salvar o orçamento de um mês anterior não muda um mês fechado.
- **Num mês fechado, tudo o que escreve nele é recusado** (409 `PERIOD_CLOSED`, com o mês):
  - os lançamentos e as partes de divisão;
  - o mês de destino ou de origem de "Mover para outro mês";
  - a parte nova do recebimento parcial;
  - recorrências e parcelamentos que alcancem o mês;
  - importar, desfazer uma importação, pagar ou desfazer uma fatura;
  - o orçamento do mês;
  - a troca da categoria da devolução ou da dívida que mova partes dele;
  - excluir uma meta com fatia nele.
- **O que não falha:**
  - `materialize` pula os meses fechados, porque ele roda em leituras;
  - "Ligar ao cartão" (`link`) pula os lançamentos de meses fechados e diz quantos ficaram de fora;
  - "Remover do histórico" de uma importação continua livre, porque não muda valores;
  - excluir o espaço ou a conta também.
- **Duas camadas:**
  - a guarda de serviço confere antes de escrever e responde com a mensagem em pt-BR;
  - um trigger em `transactions`, `budget_configs` e `budget_shares` recusa a escrita que escapar dela, e o filtro de exceções a traduz no mesmo 409. O trigger deixa passar o recebimento parcial do sem vencimento e a cascata da exclusão do espaço.
- **O que só avisa:** a marcação "Nem renda nem gasto" continua valendo para todo o histórico. A tela avisa isso ao fechar e ao trocar a marcação com meses fechados.
- **Na tela:**
  - no Painel, "Fechamento do mês" com "Fechar mês" (ou a lista do que falta), "Mês fechado em … por …", "Reabrir mês" com o motivo e o histórico;
  - o cadeado no mês, em `PeriodNav`;
  - Lançamentos só para leitura num mês fechado.

## Consequências

- **Um mês conferido fica protegido** de edição por engano, de importação no mês errado e das recorrências e parcelamentos que alcançam o passado.
- **Corrigir dá um passo a mais** (reabrir, corrigir, fechar de novo), e o histórico mostra quem fez e por quê.
- **Cada caminho novo que escreve numa competência precisa da guarda.** O trigger avisa com um erro quando ela foi esquecida, e os testes HTTP cobrem um caso por caminho.
- **Não é uma foto:** renomear e marcar categorias ainda muda o que um mês fechado mostra. Se isso incomodar, a evolução é guardar o resumo no fechamento.
- **Próximos passos:** a API (tabela, rotas, guarda e trigger) e depois a tela, um PR cada.
