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
