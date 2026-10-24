# 0061 — Extrato da conta: o identificador de cada movimento e a conferência com o que já está lançado

- **Status:** Aceita
- **Data:** 2026-10-24

## Contexto

O [ADR 0060](0060-extratos-do-banco.md) separou "Importar" em duas páginas e deixou a conta do Nubank como o próximo tipo de extrato. A análise de um extrato real mostrou que **só ler e criar lançamentos duplicaria quase tudo**. Muitos movimentos da conta já estão no app:

- como **pendentes** (salário, energia, internet, aulas), esperando ser quitados;
- ou **já quitados à mão**, às vezes com outro valor.

Sobram poucos movimentos de fato novos. Também aparecem coisas que não são renda nem gasto: o pagamento da fatura do cartão (cujas compras vêm da fatura), as caixinhas (RDB) e o dinheiro entre as suas próprias contas.

O CSV da conta é diferente do da fatura:

- **Colunas:** `Data, Valor, Identificador, Descrição`.
- **Datas:** `DD/MM/AAAA`.
- **Valores:** ponto decimal, com sinal (negativo é saída).
- **Identificador:** um código único por movimento.
- **Descrição de um Pix ou de uma transferência:** traz o nome da outra parte, o CPF (mascarado) ou o CNPJ, o banco, a agência e a conta.

## Opções consideradas

1. **Ler e criar tudo, e o dono apaga as duplicatas:** simples, mas é o problema que motivou o extrato. O Saldo previsto contaria a energia duas vezes.
2. **Evitar duplicatas só por comparação** (mesmo valor e data perto), como a fatura faz: funciona na primeira vez, mas uma segunda importação do mesmo período não sabe o que já veio.
3. **Guardar o identificador do banco em cada lançamento e conferir na revisão:** os movimentos novos são criados com o identificador. Os que já estão no app recebem o identificador e, se pendentes, são quitados no dia do movimento. Um extrato importado de novo reconhece tudo pelo identificador.

## Decisão

Opção 3, em dois passos. Este ADR registra os dois.

### O leitor (`parseNubankAccountCsv`, `packages/shared/src/account-statement.ts`)

- **Cada movimento vira uma `AccountLine`:**
  - o dia;
  - o tipo (entrada ou saída, pelo sinal) e o valor;
  - o identificador com o banco (`"NUBANK:<código>"`);
  - o que é: Pix, transferência, compra no débito, boleto, pagamento de fatura, caixinha, estorno ou outro;
  - o nome da outra parte;
  - a descrição do lançamento;
  - o meio de pagamento.
- **Do Pix e da transferência, só o nome fica.**
  - CPF, CNPJ, banco, agência e conta nunca saem do leitor ([ADR 0012](0012-privacidade-lgpd.md)). Um nome todo em maiúsculas é escrito como nome ("Maria de Souza").
  - O CPF diz que a outra parte é uma pessoa e o CNPJ, que é uma empresa (`counterpartIs`). É só uma dica para sugerir de Pessoas ou de Estabelecimentos. O documento em si não é guardado.
  - Uma descrição que o leitor não conhece fica só com a primeira parte. Assim, um documento que venha depois dela nunca passa.
- **Um identificador repetido no arquivo é lido uma vez.** Uma linha que não se lê vira um erro no relatório, como na fatura.
- **O arquivo continua lido só no navegador** e nunca chega à API ([ADR 0040](0040-importacao-da-planilha.md)). Os testes usam linhas inventadas ([ADR 0019](0019-repositorio-publico.md)).

### O identificador e a conferência (API)

- **O identificador:** `transactions.external_id` (até 100 caracteres), único por espaço, com o banco na frente (`"NUBANK:<código>"`). Assim, dois bancos nunca colidem.
  - Um lançamento importado de um extrato da conta nasce com ele.
  - O mesmo movimento nunca entra duas vezes. Se outra importação já o trouxe, a API recusa com 409 `STATEMENT_LINE_IMPORTED` e não grava nada.
- **A importação aceita `matches`, os movimentos que já estão no app.** Cada item traz `transactionId`, `externalId`, o dia do movimento (`settledAt`) e, se o banco moveu outro valor, `amountCents`.
  - O lançamento recebe o identificador.
  - **Se pendente,** é quitado no dia do movimento. **Se já quitado,** fica com o dia que tinha.
  - **Com `amountCents`,** o valor passa a ser o do banco. Num mês estimado de uma recorrência, isso confirma a estimativa, e as partes em percentual de uma recorrência dividida acompanham ([ADR 0052](0052-divisao-em-entradas-recorrencias-e-parcelamentos.md)).
  - **A competência não muda.** A conta de outubro paga em 5 de novembro continua em outubro.
  - **Recusas:** um lançamento que sumiu ou já tem outro movimento recebe 409 `STATEMENT_MATCH_CHANGED`. O mesmo movimento ou o mesmo lançamento duas vezes no pedido recebe 400 `INVALID_INPUT`.
  - **Tudo numa transação com o contexto de RLS** ([ADR 0028](0028-row-level-security.md)): a importação, o que ela cria e os lançamentos que ela encontrou, ou nada.
  - **Uma importação pode só conferir,** sem criar nada (`transaction_count` pode ser 0).
- **O vínculo:** `transactions.reconciled_import_id` guarda a importação que conferiu o lançamento. A lista de importações devolve `reconciledCount`.
- **Desfazer a importação** apaga o que ela criou, como antes. Os lançamentos que ela conferiu **ficam como estão**, quitados e com o valor do banco, e só perdem o identificador.
  - Assim, um extrato importado de novo volta a encontrá-los.
  - Desfazer a quitação seria adivinhar o que a pessoa queria. Quem conferiu errado desmarca o lançamento à mão.
  - "Remover do histórico" mantém tudo, inclusive o identificador.
- **`POST …/imports/candidates { from, to, externalIds }`** responde o que um extrato pode ser no app, antes de gravar qualquer coisa:
  - **`known`:** os movimentos do arquivo que já estão no app, com o lançamento de cada um;
  - **`transactions`:** os lançamentos sem identificador que um movimento pode ser:
    - os pendentes, de um ano antes do extrato até o mês seguinte a ele, porque a conta de outubro é paga em novembro;
    - e os quitados até uma semana antes ou depois do extrato.
  - Antes, a rota cria os meses das recorrências desse período, como abrir a competência faria, para que o salário do mês seguinte já esteja lá.
  - Só EDITOR, porque serve para importar. Ela e a importação aceitam o corpo maior (até 2.000 movimentos).
- **A exportação de dados** leva o identificador de cada lançamento.

### A revisão (o próximo passo, na tela)

A revisão do extrato da conta casa cada movimento com os candidatos:

- **"Já importado":** o identificador já está no app. O movimento vem desmarcado e não é enviado.
- **"Já lançado" / "Quitar pendente":** mesmo tipo e mesmo valor, com a data perto do vencimento ou da quitação. O movimento vai em `matches`.
- **"Valor diferente":** mesmo tipo, valor próximo. A pessoa escolhe se é o mesmo lançamento (com o valor do banco) ou um novo.
- **Desmarcados, com o motivo:**
  - **"Pagamento de fatura":** as compras já vêm da fatura;
  - **caixinhas (RDB):** o dinheiro continua seu;
  - **dinheiro entre as suas contas:** a outra parte tem o seu nome.
- **Novo:** o que não casa vem marcado, como na fatura: a categoria pelo histórico, o estabelecimento ou a pessoa pelo nome, e o meio de pagamento do movimento.
- **A competência é a do dia do movimento,** já quitado nesse dia. Um movimento que parece a conta do mês anterior (uma recorrência com vencimento no mês seguinte, paga no começo do mês) é avisado e pode mudar de mês.

O tipo "Conta" continua desabilitado em `statementBanks` até a revisão existir: sem a conferência, importar duplicaria quase tudo.

## Consequências

- **Um extrato importado de novo,** ou um período que se sobrepõe ao anterior, não duplica nada: o identificador diz o que já veio.
- **A conferência quita lançamentos que já existiam.** Desfazer a importação não desfaz essas quitações. A confirmação do desfazer vai dizer isso, com `reconciledCount`.
- **A fatura do cartão não tem identificador por linha.** Ela continua evitando duplicatas por comparação ([ADR 0055](0055-importacao-da-fatura-do-cartao.md)). A conferência pode chegar a ela depois, com os mesmos `matches`, mas sem o identificador.
- **Outros bancos e o OFX** usam o mesmo identificador (o FITID do OFX), com o banco na frente.
