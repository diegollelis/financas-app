# 0058 — Emprestado para: onde entra a volta de um empréstimo

- **Status:** Aceita
- **Data:** 2026-10-23

## Contexto

Um empréstimo novo lançado com "Dividir com alguém" cria a saída e, para a pessoa, uma parte a receber. A parte vai para Reembolso ([ADR 0042](0042-pessoas-e-rateio.md)), que não é marcada "Nem renda nem gasto" ([ADR 0056](0056-categoria-nem-renda-nem-gasto.md)). Por isso:

- a sobra para guardar conta a parte como dinheiro que volta, e o empréstimo não diminui a sobra prevista;
- a regra do [ADR 0057](0057-receber-parte-e-a-receber-sem-data.md) não vale para ela: sem vencimento, ela continua no Saldo previsto.

A saída seria fazer dois lançamentos (a saída e a entrada pendente na categoria marcada). A divisão já faz isso num só, e só falta ela saber para onde vai a parte.

Achar a categoria pelo nome ("Empréstimo pessoal" de saída ↔ "Empréstimo pessoal" de entrada) seria frágil para outras pessoas, que dão nomes diferentes ou renomeiam. Uma opção geral do tipo "modo empréstimo" criaria dois jeitos de ler os mesmos números.

## Opções consideradas

1. **Achar a categoria de entrada pelo mesmo nome:** é simples, mas frágil e implícito.
2. **Escolher a categoria a cada lançamento, no formulário:** é flexível, mas dá trabalho a cada empréstimo.
3. **A categoria de saída marcada guarda a categoria de entrada marcada da volta,** escolhida uma vez pela pessoa, por espaço.

## Decisão

Opção 3.

- **No banco:** `categories.return_category_id`, opcional, com chave estrangeira composta para `categories (id, workspace_id)`, a mesma do espaço. `PATCH …/categories/:id { returnCategoryId }` escolhe a categoria, e `null` volta para Reembolso.
  - **Só uma categoria de saída marcada escolhe:** as outras recebem 409 `NOT_A_LOAN_CATEGORY`.
  - **O alvo** é uma categoria de entrada do espaço, marcada, ativa, que não seja Reembolso nem Repasse. Um alvo fora disso recebe 400 `INVALID_RETURN_CATEGORY`.
  - **A categoria escolhida fica no lugar:** ela não é desmarcada, arquivada nem excluída enquanto for a volta de alguma (409 `CATEGORY_RECEIVES_LOANS`).
  - **Desmarcar a categoria de saída** tira a escolha.
  - **A cópia de categorias** ([ADR 0048](0048-copiar-categorias-entre-espacos.md)) leva a escolha quando as duas vão juntas, e a exportação inclui o campo.
- **As partes:** a parte de uma saída numa categoria com volta escolhida vai para a categoria de entrada, e não para Reembolso (`shareCategoryId` recebe a categoria do que é dividido). Isso vale para:
  - um lançamento, dividido ao criar ou depois;
  - cada mês de uma recorrência dividida;
  - cada parcela de um parcelamento dividido.
- **O que já foi lançado acompanha a escolha:**
  - escolher, trocar ou tirar a volta move as partes das saídas dessa categoria, recebidas ou não, para onde a volta aponta agora;
  - mudar a categoria de uma saída dividida também leva as partes dela.
  - Assim, um empréstimo lançado antes da escolha se corrige sozinho, e voltar para Reembolso desfaz.
- **Na tela:**
  - **Em Categorias:** "Onde entra a volta" no menu ⋯ de uma categoria de saída marcada, e o selo "A volta entra em …". O diálogo lista as categorias de entrada marcadas e Reembolso. Sem nenhuma marcada, ele oferece criar (ou usar e marcar) a categoria de entrada de mesmo nome.
  - **No formulário:** numa saída dessa categoria, "Dividir com alguém" vira "Emprestado para" ("Para quem?"), e o valor começa inteiro com as pessoas, sem a sua parte. O texto diz em que categoria fica o valor a receber e que, sem vencimento, ele fica fora do Saldo previsto.
  - **Na lista:** o selo diz "Emprestado para …".

## Consequências

- **Um empréstimo é um lançamento só:** a parte a receber fica fora da renda, das metas e, sem vencimento, do Saldo previsto. Ela continua em Pessoas e aceita "Receber parte".
- **Com a parte numa categoria marcada,** a saída do empréstimo diminui a sobra para guardar também no previsto, como o ADR 0056 queria.
- **Mudar a categoria de uma recorrência** dividida não move as partes dos meses pendentes já gerados. Só os meses gerados depois usam a categoria nova.
- **Uma divisão comum** (jantar, contas da casa) continua em Reembolso, sem mudança nenhuma.
