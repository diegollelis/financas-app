# 0059 — Peguei emprestado de: a categoria da dívida

- **Status:** Aceita
- **Data:** 2026-10-24

## Contexto

O [ADR 0058](0058-emprestado-para.md) resolveu o empréstimo que você **faz**: a categoria de saída marcada "Nem renda nem gasto" escolhe a categoria da devolução, e dividir uma saída dela põe o valor a receber nessa categoria.

O empréstimo que você **toma** é o lado oposto. Você recebe o dinheiro (uma entrada) e deve devolver (uma saída a pagar). Lançado com "Dividir com alguém" numa entrada, a parte a pagar ia para **Repasse** ([ADR 0052](0052-divisao-em-entradas-recorrencias-e-parcelamentos.md)). Repasse não é marcada, então a dívida contava como **gasto**: no limite de gastos e na Análise. A [nota de 2026-10-23 no ADR 0057](0057-receber-parte-e-a-receber-sem-data.md) já tira do previsto uma dívida sem vencimento numa categoria marcada. Faltava a divisão pôr a dívida lá.

Os nomes seguem o mercado, pesquisado na decisão do [ADR 0057](0057-receber-parte-e-a-receber-sem-data.md). O Wallet e o Splitwise usam a primeira pessoa ("I borrowed", "you borrowed"), e o Money Lover separa "Debt" (o que você deve) de "Loan" (o que te devem).

## Opções consideradas

1. **Uma coluna nova** para a categoria da dívida, separada da devolução: é explícito, mas exige migração e duplica regras.
2. **O mesmo campo `returnCategoryId`,** agora também nas categorias de entrada: uma categoria marcada aponta para a categoria marcada do outro lado, qualquer que seja o seu tipo.

## Decisão

Opção 2.

- **Na API:**
  - `PATCH …/categories/:id { returnCategoryId }` vale para qualquer categoria marcada. Uma de saída escolhe uma de entrada (a devolução), e uma de entrada escolhe uma de saída (a dívida).
  - **As recusas são as do ADR 0058, agora pelos dois lados:**
    - categoria não marcada: 409 `NOT_A_LOAN_CATEGORY`;
    - alvo que não seja do outro lado, marcado, ativo e diferente de Reembolso e Repasse: 400 `INVALID_RETURN_CATEGORY`, dizendo o lado esperado;
    - categoria escolhida desmarcada, arquivada ou excluída: 409 `CATEGORY_RECEIVES_LOANS`, dizendo se ela é a devolução ou a dívida.
  - `shareCategoryId(…, sourceCategoryId)` acha a categoria pelos dois lados (`loanCategoryId`). Escolher, trocar ou tirar move as partes já lançadas, e mudar a categoria de uma entrada dividida leva as partes junto.
  - **Sem migração.** A mesma categoria pode ter os dois papéis: "Empréstimo pessoal" de saída aponta para a de entrada, e a de entrada aponta para a de saída.
- **Na tela** (`loanCategoryLabels` em `packages/shared`, por tipo da categoria):
  - **Em Categorias:** "Categoria da dívida" no menu ⋯ de uma categoria de entrada marcada, e o selo "Dívida em …". O diálogo lista as categorias de saída marcadas e Repasse, e oferece criar a de mesmo nome quando não houver nenhuma.
  - **No formulário:** numa entrada dessa categoria, "Dividir com alguém" vira "Peguei emprestado de" ("De quem?"), e o valor começa inteiro com a pessoa. O texto diz em que categoria fica o valor a pagar e que, sem vencimento, ele fica fora do Saldo previsto até ser pago.
  - **Na lista:** o selo da entrada diz "Peguei emprestado de …". Em Pessoas, "Você deve", e cada devolução usa "Pagamento parcial".

## Consequências

- **Um empréstimo tomado é um lançamento só.** O dinheiro recebido fica fora da renda e das metas. A dívida fica fora do limite de gastos e, sem vencimento, do Saldo previsto e da sobra prevista. Cada pagamento conta no mês em que é feito.
- **Juros ficam fora:** a divisão não aceita partes maiores que o valor recebido. Quem deve devolver mais lança a saída pendente à parte, com o valor total. Para empréstimo de banco, o caminho é "Parcelado".
- **Uma divisão comum de entrada** (dinheiro recebido por outra pessoa) continua em Repasse.
