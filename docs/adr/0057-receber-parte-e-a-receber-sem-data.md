# 0057 — Receber parte de um lançamento pendente e o que está a receber sem data

- **Status:** Aceita
- **Data:** 2026-10-23

## Contexto

O dono emprestou dinheiro sem data para receber de volta. A pessoa devolve aos poucos, em valores e meses que não se repetem. O que ela deve foi lançado como uma entrada pendente na categoria "Empréstimo pessoal", marcada "Nem renda nem gasto" ([ADR 0056](0056-categoria-nem-renda-nem-gasto.md)), com a pessoa e sem vencimento.

Com os dados de produção, dois problemas apareceram:

1. **O Saldo previsto supunha que todo o dinheiro emprestado voltava no mês da entrada pendente.** Em Lançamentos e no "Saldo do mês" do Painel, o mês aparecia com dezenas de milhares de reais de sobra, quando na verdade fechava negativo. A marca "Nem renda nem gasto" tira a entrada da renda e das metas, mas não do saldo, e a [nota de 2026-10-22 no ADR 0056](0056-categoria-nem-renda-nem-gasto.md) tinha mantido o Saldo previsto como a soma de tudo.
2. **Cada devolução pedia dois passos à mão:** lançar o recebido e diminuir o pendente. Esquecer o segundo deixa errado o "Te deve" em Pessoas, sem que a pessoa perceba.

## Opções consideradas

1. **Levar a entrada pendente para o mês do empréstimo, sem mudar o código.** Resolve a dívida antiga, porque aquele mês não é acompanhado. Para um empréstimo novo não serve: a saída e a entrada pendente cairiam no mesmo mês e se anulariam no previsto.
2. **Tirar do Saldo previsto toda entrada pendente sem vencimento.** É simples, mas uma entrada comum sem vencimento (um salário lançado sem data) espera chegar no mês, e sumiria do previsto.
3. **Tirar do Saldo previsto só a entrada pendente sem vencimento numa categoria "Nem renda nem gasto",** e criar a ação "Receber parte". A marca já diz que o dinheiro não é renda. Sem vencimento, não há mês em que ele seja esperado.

## Decisão

Opção 3.

- **A entrada a receber sem data** (`undatedReceivable` em `packages/shared`) é uma entrada pendente, sem vencimento, numa categoria marcada.
  - Ela continua nas Entradas do mês e em Pessoas ("Te deve").
  - Ela fica fora do Saldo previsto: `balance.plannedCents` em `summarizePeriod` e `MonthTotals` em Lançamentos.
  - `undatedCents` no resumo diz quanto ficou de fora.
  - Na tela: embaixo de "Entradas", em Lançamentos, "R$ X sem data, fora do previsto". No Painel, "Não inclui R$ X a receber sem data", sob o Saldo previsto, e uma parte própria na barra das entradas ("A receber sem data").
  - Quem quiser que ela conte no previsto dá um vencimento a ela.
- **"Receber parte" / "Pagar parte"** (`POST …/transactions/:id/settle-part { amountCents, settledAt }`):
  - **Vale para** um lançamento pendente, lançado uma vez, que não está dividido e não é uma parte de divisão, um mês de recorrência nem uma parcela. Qualquer outro é recusado com 409 `NOT_PARTIALLY_SETTLEABLE`. A regra está em `partiallySettleable` (`packages/shared`), usada pelo menu e pela API.
  - **A parte é lançada já quitada,** no mês da data informada (`period` = o mês de `settledAt`), com a data como `occurredOn` e sem vencimento nem observações. O resto vem do lançamento: tipo, descrição, categoria, pessoa, estabelecimento e meio de pagamento. Por herdar a categoria, a devolução numa categoria marcada continua fora da renda.
  - **O pendente diminui o mesmo valor.** Quando o valor é tudo o que falta, o pendente é excluído em vez de quitado: quitado, o dinheiro contaria no mês do pendente, e não no mês em que entrou.
  - **Recusas de validação** (400 `INVALID_INPUT`): um valor maior que o pendente e uma data no futuro.
  - **As duas escritas** ficam numa transação interativa com o contexto de RLS ([ADR 0028](0028-row-level-security.md)).
  - **Sem migração.** A parte não guarda um vínculo com o pendente: a descrição e a pessoa já os ligam em Pessoas.
- **Na tela:**
  - **Onde aparece:** "Receber parte" (ou "Pagar parte") fica no menu ⋯ de Lançamentos e no histórico de cada pessoa em Pessoas. Em Pessoas, a dívida de qualquer mês aparece sem precisar navegar até ele.
  - **O diálogo** (`SettlePartDialog`) pede o valor e a data, que é hoje por padrão e nunca no futuro.
  - **Enquanto se digita,** ele mostra "Fica pendente R$ X" ou "Quita o que falta: o pendente sai da lista".
  - **O aviso final** diz "R$ X recebido de …". Ele não tem "Desfazer", porque o valor já foi confirmado no diálogo.

## Consequências

- **O Saldo previsto mostra o mês como ele deve fechar,** mesmo com um empréstimo grande a receber. A entrada pendente pode ficar no mês em que o dinheiro saiu.
- **A regra do Saldo previsto depende de dois dados:** o vencimento e a marca da categoria. Uma entrada a receber de um empréstimo com data combinada continua no previsto do mês dela.
- **Desfazer uma parte** é manual: excluir o recebido e editar o valor do pendente, ou recriá-lo, se ele já tiver sido excluído.
- **Pendente:** um empréstimo novo lançado com "Dividir com alguém" ainda põe a parte a receber em Reembolso, que não é marcada. O próximo passo é deixar a categoria da saída marcada apontar para uma categoria de entrada marcada, escolhida pela pessoa, e chamar a divisão de "Emprestado para".

## Nota (Emprestado para, 2026-10-23)

O pendente da última consequência foi resolvido no [ADR 0058](0058-emprestado-para.md): a categoria de saída marcada escolhe onde entra a volta, e a divisão de uma saída dela põe a parte a receber nessa categoria.

## Nota (nomes revistos, 2026-10-23)

Os nomes da tela foram comparados com os de outros apps de finanças e com o vocabulário de bancos e sistemas de gestão:

- **"Receber parte" / "Pagar parte" viraram "Recebimento parcial" / "Pagamento parcial"**, o termo da fatura do cartão, do boleto e da baixa parcial dos sistemas de contas a receber. O botão que confirma diz "Registrar recebimento" / "Registrar pagamento".
- **"Sem data" virou "sem vencimento"** ("R$ X sem vencimento, fora do previsto", "Não inclui R$ X a receber sem vencimento", "A receber sem vencimento" na barra). O campo do formulário é "Vencimento", e "Data" é outro campo do lançamento.

O código e a rota mantêm os nomes em inglês (`settlePart`, `undatedReceivable`, `undatedCents`).

## Nota (o que está a pagar sem vencimento, 2026-10-23)

O lado oposto: um empréstimo que você **tomou**. Você recebeu o dinheiro (uma entrada na categoria marcada) e deve devolver sem data (uma saída pendente, "A pagar para" a pessoa, numa categoria de saída marcada). A dívida inteira pesava no Saldo previsto e na sobra para guardar prevista do mês em que foi lançada, como se fosse paga de uma vez.

- **O que está a pagar sem vencimento** (`undatedPayable`) é uma saída pendente, sem vencimento, numa categoria marcada. Ela continua nas Saídas e em Pessoas ("Você deve"), mas fica fora do Saldo previsto e da sobra para guardar prevista (`undatedPayableCents` no resumo).
- **Cada pagamento** ("Pagamento parcial") entra no mês em que é feito e diminui a sobra daquele mês, porque o dinheiro saiu.
- **Uma dívida com vencimento combinado** continua no previsto do mês dela, e um empréstimo de banco continua como "Parcelado".
- **Na tela:** embaixo de "Saídas", em Lançamentos, "R$ X sem vencimento, fora do previsto". No Painel, "Não inclui R$ X a pagar sem vencimento". Na barra das entradas, a dívida não entra em "Saídas a pagar".
- **Juros ficam de fora desta regra:** quem deve devolver mais do que recebeu lança a saída pendente com o valor total. Separar juros (gasto) de principal (não gasto) exigiria dois lançamentos, e os apps de consumo também não fazem isso.

É o comportamento do Monarch e do YNAB, que só contam o pagamento de uma dívida sem prazo quando ele acontece.

## Nota (fora do previsto, igual nas três telas, 2026-10-24)

A regra valia para o Saldo previsto, mas os números em volta dele não a seguiam:

- **Em Lançamentos e no Painel,** "Entradas" e "Saídas" mostravam tudo, inclusive o que não tem vencimento. A conta Entradas − Saídas não chegava no Saldo previsto: com um empréstimo de R$ 42.000,00 a receber, o topo mostrava entradas muito maiores e um saldo negativo. No Painel, a barra das entradas era quase toda a parte "A receber sem vencimento".
- **Na Análise,** a visão Prevista contava o empréstimo. O mesmo mês tinha um saldo muito positivo na Análise e negativo no Painel.

O que mudou:

- **"Entradas" e "Saídas" de Lançamentos e do Painel** contam o que entra no Saldo previsto, e os números do topo fecham com ele.
  - Em Lançamentos, a linha de baixo diz "Mais R$ X sem vencimento, fora do previsto".
  - No Painel, a frase embaixo do saldo continua: "Não inclui R$ X a receber sem vencimento".
- **A barra das entradas, no Painel,** perde a parte "A receber sem vencimento": mostra o que foi pago, o que falta pagar e o saldo previsto, que somam as entradas do topo.
- **A visão Prevista da Análise** aplica a mesma regra.
  - A rota devolve, em cada soma, quanto está pendente e sem vencimento numa categoria marcada (`undatedCents`), e as funções de `packages/shared/src/analysis.ts` tiram esse valor dos totais, do mês a mês e dos rankings.
  - O Saldo do período diz "Não inclui R$ X a receber sem vencimento" (ou "a pagar").
  - A visão Realizada não muda, porque um pendente nunca entra nela.
- **A lista de lançamentos e Pessoas** continuam mostrando o empréstimo como antes. O cálculo do Saldo previsto não muda.
