# 0062 — Cartões (crédito e débito) e "Pagar fatura"

- **Status:** Aceita
- **Data:** 2026-10-28

## Contexto

A fatura do cartão importada ([ADR 0055](0055-importacao-da-fatura-do-cartao.md)) traz cada compra **pendente**, com o meio Crédito e vencendo no dia da fatura. Quando a fatura é paga, cada compra precisa ser marcada como paga, uma por uma. No extrato da conta ([ADR 0061](0061-extrato-da-conta-e-conferencia.md)), o pagamento da fatura (`CARD_BILL`) vem desmarcado, porque as compras já vêm da fatura, e por isso não quita nada.

O dono do projeto quer um atalho para isso: escolher o cartão e a fatura e quitar tudo de uma vez. Hoje ele usa só o Nubank, mas o caminho precisa servir para outros bancos.

O app não tem cartões. O meio de pagamento é uma lista fixa ([ADR 0054](0054-meio-de-pagamento.md)), e esse ADR deixou o cadastro de cartões para depois, porque, sem saldo nem fatura, ele não teria uso. A fatura era só a origem dos lançamentos (ADR 0055). Hoje, o que liga uma compra a uma fatura é só a importação, com a origem, o banco e o vencimento. Uma compra lançada à mão não tem essa ligação, e dois cartões que vencem no mesmo dia se misturariam.

O cartão de débito precisa do cadastro por outro motivo: ele não tem fatura, mas diz de qual cartão, e de qual banco, saiu a compra. Isso serve para a Análise e para o extrato da conta, em que a compra no débito aparece.

## Opções consideradas

1. **Sem cadastro:** "Pagar fatura" junta os débitos pendentes com o meio Crédito pelo vencimento. É pequeno e funciona com um cartão só. Mas não permite escolher o cartão: dois cartões com o mesmo vencimento se misturam, e o débito fica sem nada.
2. **Um cadastro leve de cartões,** com as funções Crédito e Débito e os dias do fechamento e do vencimento, sem limite nem saldo. Agora a fatura dá ao cadastro o uso que faltava no ADR 0054.
3. **Contas e Cartões completos:** saldo por conta, limite do cartão e transferências. É uma mudança grande no domínio, e não é necessária para pagar a fatura.

## Decisão

Opção 2.

**O cartão**

- **Tabela `cards`, com RLS, do espaço**, como os estabelecimentos. Cada cartão tem:
  - **nome**, único no espaço, ignorando maiúsculas e acentos ("Nubank", "Cartão Exemplo");
  - **banco**, da lista de bancos dos extratos (`statementBanks`, [ADR 0060](0060-extratos-do-banco.md)), opcional para um banco que o app ainda não lê;
  - **funções**: Crédito, Débito ou as duas (`functions`: `CREDIT`, `DEBIT`), porque um cartão múltiplo é um cartão só;
  - **dia do fechamento e dia do vencimento**, obrigatórios só com a função Crédito.
- **Não guarda limite nem saldo.** Contas, com saldo e transferências, continuam fora (ADR 0054).
- **Arquiva-se em vez de excluir:** só um arquivado sem uso é excluído, como os estabelecimentos. A exportação de dados leva os cartões.

**O cartão no lançamento**

- **Onde fica:** lançamentos, recorrências, parcelamentos e importações ganham um `cardId` opcional, com chave composta (o cartão do mesmo espaço).
- **Quando é aceito:** só com o meio Crédito ou Débito, e só se o cartão tiver essa função. Fora disso, é recusado.
- **O que copia o cartão:** cada mês de uma recorrência e cada parcela, como copiam o meio. As partes de uma divisão nunca o copiam.
- **No formulário,** o seletor de cartão aparece quando o meio é Crédito ou Débito. Quando há um cartão só com aquela função, ele já vem escolhido.
- **O vencimento é sugerido com Crédito,** pelo fechamento e pelo dia do vencimento do cartão: uma compra depois do fechamento vai para a fatura seguinte. A sugestão nunca troca um vencimento digitado.
- **Ao criar o primeiro cartão,** o app oferece ligar a ele os lançamentos sem cartão com os meios das funções que ele tem: os de crédito pendentes, para entrarem na fatura, e os de débito, para a Análise.

**A fatura e "Pagar fatura"**

- **A fatura é o cartão mais o vencimento.** Não é uma tabela: são os lançamentos daquele cartão, com o meio Crédito, que vencem naquele dia.
- **"Pagar fatura"** quita numa vez os pendentes da fatura, num só dia, o "Pago em".
  - Quita as compras e também os estornos (entradas no Crédito), que abatem do total.
  - O total mostrado é a soma das compras menos a dos estornos.
  - Tem "Desfazer", que volta a pendentes só os lançamentos que aquele pagamento quitou e que continuam quitados naquele dia.
- **Parcelas futuras** de um parcelamento no cartão vencem cada uma na sua fatura, e só aparecem para pagar quando o vencimento delas chega.

**A importação**

- **A fatura do cartão pergunta "Qual cartão?":** o banco do cartão escolhe o leitor do arquivo. Um banco novo continua sendo um leitor novo, sem mudar a revisão.
  - As compras, os parcelamentos criados e os lançamentos conferidos recebem o cartão.
  - A "Origem" sugerida passa a ser o nome do cartão.
- **No extrato da conta,** uma compra no débito recebe o cartão daquele banco que tem a função Débito, quando há um só.

**Fica para um passo depois**

- O pagamento da fatura no extrato da conta (`CARD_BILL`) casar com a fatura aberta do cartão daquele banco e quitá-la.
- A diferença entre o valor pago e a soma das compras (juros, um IOF que não veio na fatura). Por enquanto, "Pagar fatura" só mostra a soma.

## Consequências

- **O meio de pagamento continua** sendo uma lista fixa. O cartão é um detalhe dos meios Crédito e Débito, e não os substitui. Um lançamento antigo, sem cartão, continua válido.
- **Uma compra no crédito lançada à mão** só entra em "Pagar fatura" se tiver o cartão e o vencimento da fatura. A sugestão do vencimento existe para isso.
- **Contas continuam possíveis:** um cadastro de contas poderia, mais tarde, ser o dono dos cartões (o débito sai de uma conta), sem perder o que já foi lançado.
- **Passos, um por PR:**
  1. Docs: este ADR, o glossário, o modelo e o roadmap.
  2. API: a tabela de cartões e as rotas, o `cardId` nos lançamentos, recorrências, parcelamentos e importações, e a exportação.
  3. Tela: a página "Cartões" (no Mais) e o cartão no formulário, com a sugestão do vencimento e a oferta de ligar os lançamentos sem cartão.
  4. Importação: "Qual cartão?" na fatura e o cartão de débito no extrato da conta.
  5. API e tela de "Pagar fatura", com prévia antes da tela.
  6. O pagamento da fatura no extrato da conta quitando a fatura.
