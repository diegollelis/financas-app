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

## Nota (a API dos cartões, 2026-10-28)

- **A tabela `cards`** (com RLS) guarda as funções em duas colunas, `credit` e `debit`. Na API, elas aparecem como a lista `functions`. Dois CHECKs garantem as regras: o cartão tem ao menos uma função, e o dia do fechamento e o do vencimento (de 1 a 31) existem só com Crédito, os dois juntos.
- **Rotas** `GET/POST /workspaces/:workspaceId/cards` e `PATCH/DELETE …/cards/:cardId`, como as dos estabelecimentos. Os erros:
  - nome repetido, ignorando maiúsculas e acentos: 409 `CARD_EXISTS`;
  - tirar uma função que algum lançamento, recorrência ou parcelamento usa com aquele meio: 409 `CARD_FUNCTION_IN_USE`;
  - excluir um cartão em uso: 409 `CARD_IN_USE`. Uma importação também conta como uso.
  - Tirar o Crédito apaga os dias. Dar o Crédito exige os dias.
- **O `cardId`** de lançamentos, recorrências, parcelamentos e importações tem chave composta.
  - Um CHECK no banco só o aceita com o meio Crédito ou Débito.
  - A API confere a função do cartão e responde 400 `INVALID_CARD`. Um cartão arquivado só é recusado quando está sendo escolhido.
  - Numa edição, o cartão e o meio são conferidos juntos: trocar só o meio para Pix, mantendo o cartão, é recusado.
- **Numa recorrência ou num parcelamento,** mudar o cartão ou o meio leva os dois juntos aos meses e às parcelas pendentes, para que continuem combinando.
- **O cartão vai junto** para "Tornar recorrente", "Tornar parcelado" e o recebimento ou pagamento parcial, e entra na exportação de dados. As partes de uma divisão não o recebem.

## Nota (o cartão obrigatório e a tela, 2026-10-28)

A decisão de deixar o cartão opcional foi revista na prévia da tela: o dono quer mais controle, e um lançamento no Crédito ou no Débito sem cartão ficaria fora da fatura e da Análise por cartão.

- **Com Crédito ou Débito, o cartão é obrigatório daqui em diante.** A API recusa com 400 `CARD_REQUIRED` o que é criado (lançamento, recorrência, parcelamento) e toda mudança que envia o meio ou o cartão. Um lançamento de antes dos cartões continua válido até ser editado. Como o formulário sempre envia o meio, editá-lo pede o cartão.
- **Ficam de fora, por enquanto,** as importações (o passo 4 dá o cartão à planilha modelo e aos extratos), "Tornar recorrente", "Tornar parcelado" e o recebimento ou pagamento parcial, que copiam o que já existe.
- **Ligar os de antes:** `GET …/cards/unlinked` conta os lançamentos sem cartão de cada função (no Crédito, só os ainda a pagar). `POST …/cards/:cardId/link { functions }` dá o cartão a esses lançamentos e às recorrências e parcelamentos em andamento daqueles meios sem cartão, numa só transação. Só vale para as funções que o cartão tem.
- **Na tela:**
  - **A página "Cartões"** fica no Mais, como Estabelecimentos: busca pelo nome ou pelo banco, um cartão compacto por cartão, com as funções em selos e "Nubank. Fecha no dia 27 e vence no dia 4.", e "Novo cartão" fixo acima da barra de abas no celular. O menu ⋯ tem Editar e Arquivar; num arquivado, Reativar e, sem uso, Excluir.
  - **O formulário do cartão** tem nome, banco ("Outro banco" para um que o app ainda não lê), as funções numa escolha entre três ("Crédito | Débito | Crédito e débito") e, com Crédito, "Fecha no dia" e "Vence no dia", com uma frase que mostra o efeito ("Uma compra hoje, 28/10/2026, entra na fatura que vence em 04/12/2026.").
  - **Depois do primeiro cartão,** quando há lançamentos sem cartão nas funções dele, a página oferece ligá-los, com os grupos já marcados. "Agora não" deixa como está.
  - **No lançamento, na recorrência e no parcelamento,** "Cartão" aparece logo depois do meio, só com Crédito ou Débito. Ele já vem escolhido quando um só cartão tem a função, e o seletor tem "Novo cartão", que cadastra um sem sair do formulário.
  - **O vencimento sugerido:** com Crédito, num lançamento novo, o vencimento vazio é preenchido pela fatura do cartão (`cardBillDueDate`, pela data da compra, ou por hoje), com "Sugerido pela fatura do …". Ele nunca troca uma data digitada.
  - **Na linha e na tabela,** o meio aparece com o nome do cartão: "Crédito no Cartão Exemplo".

## Nota (o cartão na importação, 2026-10-28)

- **A importação também exige o cartão:** uma linha ou um parcelamento no Crédito ou no Débito sem cartão é recusado com 400 `CARD_REQUIRED`. Assim fecha a exceção deixada na nota anterior.
- **Fatura do cartão:** "Nova importação" pergunta "Qual extrato?" primeiro.
  - Na fatura vem "Qual cartão?", com os cartões com Crédito de um banco que o app lê. O banco, e com ele o leitor do arquivo, vem do cartão. Sem cartão, o arquivo espera, e o seletor tem "Novo cartão".
  - Na conta, continua "Banco".
  - A importação grava o cartão (`imports.card_id`), a revisão o mostra no subtítulo, e a "Origem" sugerida passa a ser o nome dele.
  - Cada compra e cada parcelamento recebe o cartão. Um lançamento já no app que a fatura confere passa a ser Crédito nele, mesmo que estivesse sem meio (o mês de uma recorrência lançada à mão, por exemplo).
- **Extrato da conta e planilha modelo:** a revisão ganha o bloco "Cartões", com um seletor para cada função que as linhas marcadas usam. Esse cartão vale para todas as linhas daquela função no arquivo.
  - Por padrão vem o único cartão ativo com a função do banco do extrato, ou o único que existe com ela.
  - Sem escolha, o botão de importar diz "Escolha o cartão do Débito" e leva até o campo.
  - Um seletor por linha foi descartado: um extrato é de um banco, e trocar o cartão de um lançamento fica para "Editar", depois de importar.
- **As importações antigas** ficam como estão.

## Nota (o "Pagar fatura", 2026-10-28)

- **As faturas a pagar:** `GET …/cards/bills` lista os lançamentos pendentes no Crédito com cartão e vencimento, agrupados por cartão e vencimento, a fatura mais antiga primeiro. Cada fatura traz os seus lançamentos, de qualquer mês, e o total, compras menos estornos (`cardBillTotal`).
- **Pagar:** `POST …/cards/:cardId/bills/pay { dueDate, settledAt }` quita numa transação só todos os pendentes daquela fatura, naquele dia. Um mês de recorrência com valor estimado fica confirmado. A rota devolve os ids quitados e o total.
  - Um dia no futuro é recusado com 400 `INVALID_INPUT`.
  - Uma fatura sem pendentes é recusada com 409 `NOTHING_TO_PAY`.
- **Desfazer:** `POST …/cards/:cardId/bills/undo { transactionIds, settledAt }` volta a pendentes só os lançamentos daquele cartão que continuam quitados naquele dia.
- **Na tela, num diálogo só** (`features/cards/pay-bill-dialog.tsx`), aberto de dois lugares, decididos na prévia:
  - em Lançamentos, por um botão de contorno "Pagar fatura" na linha do mês, para quem edita, quando há fatura a pagar;
  - em Cartões, por "Pagar fatura" no menu ⋯ de um cartão com Crédito, com o cartão já definido.
  - O Painel fica de fora por enquanto.
- **O diálogo:**
  - o cartão (já escolhido quando só um tem fatura) e a fatura, com uma vencida dita em vermelho;
  - a lista dos lançamentos com sinal e o total;
  - "Pago em" com hoje, nunca no futuro;
  - o botão "Pagar R$ X (N lançamentos)";
  - o aviso "Fatura do … paga", com "Desfazer".
- **Pagar só uma parte da fatura** (o mínimo, um valor menor) fica para depois: o diálogo sempre paga tudo o que está pendente nela.
