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

## Nota (o Pix do acerto no extrato da conta, 2026-11-04)

O passo 4. Na revisão do extrato da conta ([ADR 0061](0061-extrato-da-conta-e-conferencia.md)), um Pix com uma pessoa do espaço pode ser o acerto com ela. Antes, ele só podia casar com um lançamento de mesmo valor, entrar como lançamento novo (a saída em dobro, porque as compras já estão lançadas) ou ficar fora.

- **O movimento fica no acerto.** O acerto não tem uma saída própria (quitar as compras é o pagamento), então o identificador do movimento vai para o próprio acerto: `person_settlements.external_id`, único no espaço junto com o dos lançamentos (a importação confere os dois). O acerto guarda também a importação que o criou (`import_id`) ou que o conferiu (`reconciled_import_id`). Um movimento já importado num acerto é reconhecido na próxima importação, como o de um lançamento.
- **A pessoa do Pix** é achada como no recebimento parcial: o nome da outra parte, quando o extrato diz que é uma pessoa (CPF), igual ao de uma pessoa ativa do espaço, sem diferenciar maiúsculas e acentos.
- **"Já no app" (o acerto já feito):** um Pix da pessoa com o valor transferido no acerto (`settlementTransferCents`: as compras, menos o compensado, menos a recompensa) e até 5 dias de distância do dia do acerto, num acerto ainda sem movimento. Quando o valor é positivo, o Pix é enviado ("Você transfere"); quando é negativo, é recebido ("Ana te transfere"). Importar só grava o identificador no acerto. Essa conferência vem antes da de lançamentos.
- **"Paga o acerto com Ana" (o acerto ainda não feito), só num Pix enviado:**
  - **As compras:** as saídas pendentes da pessoa até o mês do Pix, como as que o diálogo traz marcadas. Ficam de fora o empréstimo sem vencimento (que é do "Pagamento parcial") e os meses de recorrência à frente. Nada é compensado.
  - **Quando é oferecido:** quando o Pix fica entre **50% e 100%** do total das compras, e nenhuma saída sozinha tem o valor exato (a saída de valor exato continua casando com o lançamento, como antes). Fora dessa faixa, ou quando o Pix passa do total, a linha entra desmarcada, dizendo quanto a pessoa tem a receber.
  - **A recompensa** é a diferença entre as compras e o Pix, quando houver, na categoria escolhida como no diálogo: a da última recompensa da pessoa, senão "Bônus".
  - **Importar** faz o mesmo que "Pagar a Ana": quita as compras no dia do Pix, lança a recompensa recebida nesse dia e cria o acerto, já com o identificador do movimento.
  - "Não é este" transforma a linha num lançamento novo, como nas outras conferências.
- **A ordem na revisão:** o acerto já feito, a saída de mesmo valor, o acerto novo, o "Valor diferente" e, por último, o pagamento parcial.
- **Desfazer a importação:** um acerto criado por ela é desfeito como em "Desfazer" (as compras que continuam quitadas naquele dia voltam a pendentes, e a recompensa e o acerto são excluídos). Um acerto que ela só conferiu fica, sem o identificador.
- **Na API:**
  - a importação aceita `settlements`, cada item no formato `{ settlementId, externalId }` (conferir) ou `{ personId, transactionIds, settledAt, externalId, rewardCents }` (criar);
  - algo que mudou desde a revisão dá 409 `STATEMENT_MATCH_CHANGED`;
  - a lista conta `settlementCount`;
  - os candidatos do extrato trazem os acertos sem movimento dos dias do arquivo;
  - a exportação leva as colunas novas.
- **Na tela:**
  - o selo "Já no app" ou "Paga o acerto", com o que o acerto quita ("Quita 4 saídas de Ana (R$ 520,00); recompensa de R$ 52,00");
  - a linha "Acertos com pessoas" na Conferência;
  - os acertos contados no botão e no aviso de sucesso;
  - o desfazer explica o que volta.
