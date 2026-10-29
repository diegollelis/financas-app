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

## Nota (a API, 2026-10-29)

O que a implementação ajustou no que foi decidido:

- **Sem índice único parcial.** O Prisma só declara um índice parcial com um recurso em teste (`partialIndexes`). No lugar dele, fechar e reabrir travam a linha do espaço (`SELECT … FOR UPDATE`, como o [ADR 0024](0024-espacos-membros-e-espaco-pessoal.md) faz com a do usuário). Assim, dois fechamentos ao mesmo tempo esperam um pelo outro, e só um fica em vigor.
- **Só fecha um mês que já começou** (400 `INVALID_INPUT`).
- **Como o erro do trigger chega à API:** o Prisma o embrulha com um código diferente em cada tipo de chamada (`P2010` numa consulta crua, `P2039` numa de modelo). Por isso o filtro reconhece o erro pelo SQLSTATE próprio do trigger, `FC001`, e lê o mês no `DETAIL` (`closedPeriodOf` em `apps/api/src/periods/period-lock.ts`).
- **O que o trigger deixa passar,** além do recebimento parcial e da cascata da exclusão do espaço:
  - a mudança só de vínculos (`import_id`, `reconciled_import_id`, `split_of_id`): esquecer uma importação ou excluir o lançamento dividido não mexe em valores;
  - a mudança sem nenhuma diferença.
- **A guarda de serviço é mais estrita que o trigger:** num mês fechado, o sem vencimento só aceita o recebimento ou pagamento parcial, e não uma edição do valor. Ela confere antes de escrever nos fluxos de vários passos: editar um lançamento e as partes dele, mudar ou encerrar uma recorrência ou um parcelamento, importar, trocar a categoria da devolução.
- **Arquivar uma meta com o mês atual fechado** tira a fatia dela a partir do primeiro mês aberto. O mês fechado guarda o orçamento que tinha.
- **"Ligar ao cartão"** deixa de fora os lançamentos de um mês fechado, e a contagem dos sem cartão também.
- **O resumo e a lista de lançamentos não ganharam `closed`.** A lista é um array, e mudar o formato dela mexeria em todas as telas. A tela lê `GET …/periods/:period/closing`, que traz o fechamento em vigor, o histórico e o que falta para fechar.
- **Fica para a tela:** a revisão de um extrato com linhas de um mês fechado. Hoje a importação inteira é recusada com `PERIOD_CLOSED`; a revisão deve deixar essas linhas desmarcadas, com o motivo.
