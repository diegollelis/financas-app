# 0065 — Acerto com uma pessoa: pagar de uma vez o que se deve, com compensação e recompensa

- **Status:** Aceita
- **Data:** 2026-10-30

## Contexto

O dono do projeto usa o vale-alimentação de outra pessoa (a Ana, nos exemplos) e, no fim do mês, transfere a ela o total das compras. Às vezes ela devolve um percentual como recompensa, e a transferência sai menor.

Cada compra já pode ser lançada assim: uma saída pendente na categoria do que se comprou (Alimentação), com o meio "Vale-alimentação/refeição" ([ADR 0054](0054-meio-de-pagamento.md)) e "A pagar para Ana" ([ADR 0042](0042-pessoas-e-rateio.md)). O que falta:

- **Quitar tudo de uma vez.** Hoje é compra por compra, como era a fatura antes do "Pagar fatura" ([ADR 0062](0062-cartoes-e-pagar-fatura.md)).
- **Registrar a recompensa.** Ela é dinheiro que fica com quem comprou. Sem lançá-la, o saldo do app não bate com a transferência; diminuir o valor das compras apagaria o que de fato se gastou.
- **Compensar, quando se quiser.** Se a Ana também deve algo (entradas "A receber de Ana"), às vezes se acerta o líquido numa transferência só, e às vezes não.

## Opções consideradas

1. **Sem tabela, como a fatura:** o acerto é o conjunto das saídas pendentes da pessoa, quitadas juntas, e a recompensa uma entrada solta. É pequeno. Mas a recompensa não fica ligada ao que abateu, o "Desfazer" só existe enquanto o aviso está na tela, e nada diz qual entrada da Ana foi recompensa e qual foi a volta de um empréstimo (para lembrar a categoria e para a conferência do extrato).
2. **Um registro do acerto** (`person_settlements`), que guarda o dia, os totais e a recompensa, e marca os lançamentos que quitou. Um pouco maior, mas dá histórico, desfazer a qualquer tempo e algo para casar com o Pix no extrato da conta.
3. **Lançar o pagamento como uma saída "Pagamento à Ana"** e deixar as compras como estão. Contaria o gasto duas vezes, ou exigiria uma categoria "Nem renda nem gasto" só para isso. Descartada.

## Decisão

Opção 2.

**O acerto**

- **Tabela `person_settlements`, com RLS, do espaço:** a pessoa, o dia (`settled_at`), as compras (`debit_cents`, a soma das saídas quitadas), o compensado (`credit_cents`, a soma das entradas quitadas), a recompensa (`reward_transaction_id`, nula sem ela) e quem fez (`created_by`).
- **Em `transactions`, `settlement_id`** (opcional, chave composta com o mesmo espaço) nos lançamentos que o acerto quitou, dos dois lados.
- **Quitar as compras é o pagamento.** Nenhuma saída a mais é criada, como no "Pagar fatura".
- **O acerto parte de pelo menos uma saída** ("Pagar a Ana"). Acertar só entradas fica para depois.

**O que entra**

- **As saídas pendentes da pessoa,** de qualquer mês. Vêm marcadas as desta competência e das anteriores, como o "Você deve" de Pessoas; as outras podem ser marcadas.
- **As entradas pendentes da pessoa, desmarcadas.** Marcar uma é compensar: ela é quitada no mesmo dia, e o valor a transferir é o líquido.
- **Num só dia,** o "Pago em", nunca no futuro. Um mês de recorrência com valor estimado fica confirmado, como no "Pagar fatura".

**A recompensa**

- **Opcional,** digitada em % ou em R$. O % incide sobre as compras marcadas, nunca sobre o compensado. O valor fica entre zero e o total das compras.
- **É uma entrada já recebida,** no dia do acerto e na competência desse dia (como o "Recebimento parcial", [ADR 0057](0057-receber-parte-e-a-receber-sem-data.md)), com a pessoa e a descrição "Recompensa de Ana", que pode ser mudada.
- **A categoria é escolhida no acerto** entre as de entrada ativas. O próximo acerto com a mesma pessoa sugere a do último que teve recompensa; o primeiro sugere "Bônus", quando existe. Conta como renda; quem não quiser isso escolhe uma categoria "Nem renda nem gasto" ([ADR 0056](0056-categoria-nem-renda-nem-gasto.md)).

**As contas fecham com a transferência**

| Compras | Compensado | Recompensa | Transferência | Efeito no saldo |
| ------- | ---------- | ---------- | ------------- | --------------- |
| 500     | 0          | 50         | 450 para Ana  | −500 + 50       |
| 500     | 100        | 50         | 350 para Ana  | −500 + 100 + 50 |
| 100     | 300        | 0          | 200 da Ana    | −100 + 300      |

Com o líquido a favor de quem acerta, o botão diz "Receber R$ X de Ana".

**Desfazer**

- **Excluir o acerto** volta a pendentes os lançamentos que continuam quitados por ele, exclui a recompensa e o registro. O aviso do acerto tem "Desfazer", que faz o mesmo.
- **Um lançamento que volta a pendente sozinho** (desmarcar "Pago em") sai do acerto: o `settlement_id` fica nulo. Os totais do registro ficam como foram, porque são o que se transferiu naquele dia.
- **Excluir a recompensa sozinha** deixa o acerto sem ela.

**API**

- `GET …/people/:personId/settlement`: as saídas e as entradas pendentes da pessoa e a categoria sugerida para a recompensa.
- `POST …/people/:personId/settlements { transactionIds, settledAt, reward? }` (EDITOR), numa transação só:
  - um lançamento que não é pendente desta pessoa recusa tudo com 409 `SETTLEMENT_CHANGED`;
  - sem nenhuma saída, 409 `NOTHING_TO_PAY`;
  - um dia no futuro, ou uma recompensa fora do intervalo, 400 `INVALID_INPUT`;
  - um mês fechado ([ADR 0063](0063-fechamento-do-mes.md)), 409 `PERIOD_CLOSED`.
- `DELETE …/people/:personId/settlements/:settlementId` (EDITOR): desfaz.
- A exportação de dados leva os acertos.

**Na tela**

- **"Pagar a Ana"** no card da pessoa em Pessoas, quando há algo a pagar, e no menu ⋯ dela.
- **Um diálogo** (como o do "Pagar fatura"): "Você deve" com as saídas, "Compensar o que Ana te deve" com as entradas (só quando há), "Pago em", "Recompensa (opcional)" com a categoria, o resumo "Compras − Compensado − Recompensa = Você transfere R$ X", e o botão "Pagar R$ X (N lançamentos)".
- **No histórico da pessoa,** os lançamentos quitados por um acerto dizem "Acerto de 30/10", e a recompensa aparece como entrada.

## Consequências

- O "A pagar para" ganha um fechamento como o do cartão, sem mudar como se lança cada compra.
- A recompensa entra em "Entradas do mês" e na Análise, na categoria escolhida; o gasto com as compras fica inteiro no limite de gastos.
- Uma tabela a mais com RLS, no `resetDatabase()` dos testes e na exportação.
- **Passos:**
  1. Este ADR, o glossário, o modelo e o roadmap.
  2. API: a tabela, as rotas, a exportação e os testes.
  3. Tela (com prévia): o diálogo em Pessoas, com "Desfazer".
  4. Extrato da conta: um Pix para a pessoa que bate com um acerto já feito entra como "Já no app"; sem acerto, oferece "Paga o acerto com Ana", com a diferença como recompensa (no molde do `billPaidBy`).
- **Fica de fora, por enquanto:** acertar só entradas ("Receber de Ana" sem compras) com um desconto dado; marcar o vale como "da Ana" (um cartão de outra pessoa), já que a pessoa no lançamento basta.

## Nota (a tela, 2026-10-30)

- **Também em Lançamentos:** o menu ⋯ de uma saída pendente com "A pagar para" ganha "Pagar a Ana", que abre o mesmo diálogo com tudo o que se deve à pessoa, não só aquele lançamento. A linha do mês fica como está: um segundo botão de contorno ao lado do "Pagar fatura" disputaria espaço no celular.
- **Em Pessoas, como uma linha de Lançamentos:** a ação da linha é o mesmo "↑ Pagar" de um lançamento (`SettleButton`, com o nome acessível "Pagar: Ana" e vermelho só com algo vencido). Ele fica embaixo dos valores com o ⋯, um sobre o outro no celular e lado a lado a partir de md, e abre "Pagar a Ana". Vale também para quem é membro do espaço, que não tem menu.
- **O menu ⋯ da pessoa não repete a ação.** Foi uma decisão do dono do projeto depois de conferir em produção, uma exceção à regra da skill de interface ("a ação da linha também por extenso no menu"): o botão já diz o que faz, e a pessoa é a do próprio card.
- **O diálogo** (`features/people/settle-person-dialog.tsx`, a conta em `features/people/settlement.ts`): os campos ficam numa coluna, como no "Pagar fatura": "Pago em" curto, e a recompensa e a categoria numa largura média. O seletor "% | R$" fica ao lado do campo da recompensa, numa linha, e embaixo vem o valor calculado ("R$ 50,00 das compras marcadas.", ou "Devolvido sobre as compras." sem valor), ligado ao campo. Duas colunas deixavam a recompensa espremida e a categoria sozinha numa linha, e foram trocadas depois de um teste em produção. Cada linha diz a categoria, o estabelecimento, o dia da compra e o vencimento, sem o ano quando é o da competência.
- **Os textos de ajuda não repetem o nome da pessoa,** para economizar tela no celular ("Fica lembrada para o próximo acerto."). O nome fica no título, em "Compensar o que Ana te deve" e em "Ana te transfere", onde diz quem faz o quê.
