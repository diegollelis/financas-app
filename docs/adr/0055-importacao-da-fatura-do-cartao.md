# 0055 — Importação da fatura do cartão, data da compra e apelidos de estabelecimento

- **Status:** Aceita
- **Data:** 2026-10-17

## Contexto

Lançar as compras do cartão de crédito à mão, uma a uma, é o que mais dá trabalho no dia a dia. Os bancos exportam a fatura num arquivo, e o dono do projeto quer importá-lo, com um lugar para ajustar antes de gravar.

A importação de hoje ([ADR 0040](0040-importacao-da-planilha.md)) só lê a planilha modelo. Ela já tem o que falta para a fatura: a revisão por mês, a edição e a correção de cada linha, a correspondência de categorias, a importação tudo ou nada e o "Desfazer".

O primeiro arquivo é o CSV da fatura do Nubank. Ele tem três colunas, `date,title,amount`, e o valor em texto no formato brasileiro, entre aspas (`"31,90"`, `"5.150,01"`, `"- 1,64"`). Ao lê-lo, apareceram três lacunas:

1. **Falta a data da compra.** Um lançamento guarda o mês de referência, o vencimento e o "pago em", mas não o dia em que a compra aconteceu. Numa compra de 16/10 que entra na fatura de novembro, esse dia se perde.
2. **O título do extrato não é o nome do estabelecimento:** "Ifd*Paladar Pizzas", "Mp _Lepoaconvites", "Spaceship.Com_ Gypcbz". Sem uma ligação entre o texto do extrato e o estabelecimento cadastrado, ele teria de ser corrigido a cada fatura.
3. **Parte das linhas são parcelas** ("Parcela 3/10") e se repetem nas faturas seguintes.

O arquivo de exemplo é uma fatura real do dono. Como o repositório é público ([ADR 0019](0019-repositorio-publico.md)), nada dele entra em código, testes ou docs: os testes usam um CSV inventado, e o arquivo é lido só no navegador, como a planilha.

## Opções consideradas

**Em qual mês de referência as compras entram**

1. **No mês da fatura** (a que vence em 04/11 entra em novembro): bate com o caixa e com o "vence no mês seguinte" das recorrências ([ADR 0038](0038-recorrencias-e-parcelamentos.md)).
2. **No mês da compra:** bate com o consumo, mas o mês passa a ter gastos que só saem do caixa no mês seguinte.
3. **Perguntar a cada importação:** um passo a mais em toda fatura.

**O que fazer com as parcelas**

1. **Cada parcela como um lançamento simples,** todo mês: fácil, mas duplica se houver um parcelamento no app.
2. **Casar com um parcelamento que já existe** e, sem ele, lançar simples.
3. **Criar o parcelamento** com as parcelas que faltam, na primeira vez que a compra aparece, e casar nas faturas seguintes.

**Como numerar um parcelamento criado no meio**

1. **Como a fatura, de 3/10 a 10/10:** pede um campo novo, a parcela inicial.
2. **De 1/8 a 8/8, com uma observação:** sem campo novo, mas o app e a fatura passam a mostrar números diferentes.

**Como ligar o título do extrato ao estabelecimento**

1. **Comparação exata:** falha nos títulos com um código que muda a cada compra ("Spaceship.Com* Gypcbz", "Spaceship.Com* H2m9u1").
2. **Pelo começo do título,** com apelidos que a pessoa pode encurtar para a parte que não muda.

## Decisão

**Data da compra**

- Os lançamentos ganham uma data opcional, só o dia (`transactions.occurred_on`, `occurredOn`). Ela não muda o mês de referência.
- Na tela: **"Data da compra"** numa saída e **"Data"** numa entrada, perto do vencimento.
  - Vem com o dia de hoje quando o mês aberto é o atual, e em branco num mês passado ou futuro, para não gravar um dia errado sem ninguém perceber.
  - Aparece na linha e na tabela. A forma, na tabela, é decidida com uma prévia no PR da tela.
- Os meses de uma recorrência e as parcelas de um parcelamento são gerados sem data; quem diz o dia é o vencimento. Lançamentos antigos ficam sem data.
- A planilha modelo ganha a coluna opcional "Data".

**Apelidos de estabelecimento**

- Um estabelecimento ([ADR 0053](0053-estabelecimentos.md)) pode ter vários **apelidos**: os textos como aparecem no extrato. Ficam numa tabela própria (`merchant_aliases`, com RLS), e cada apelido aponta para um estabelecimento só, sem se repetir no espaço (ignorando maiúsculas e acentos). Excluir o estabelecimento leva os apelidos.
- **Comparação:** o título da linha e o apelido são normalizados (sem maiúsculas e acentos, sem o " - Parcela n/N" do fim, com os espaços acertados). Um apelido vale quando é o **começo** do título, e o mais longo vence.
- **Aprende na revisão:** quando a pessoa escolhe ou cria o estabelecimento de uma linha sem correspondência, "Lembrar como apelido" vem marcado. O texto sugerido é o título limpo, que pode ser encurtado ("Spaceship.Com"). Ao importar, o apelido é gravado.
- A página Estabelecimentos mostra "Também aparece como: …" em cada estabelecimento, para ver, corrigir e remover os apelidos.
- O seletor de estabelecimento do formulário também encontra pelo apelido. A exportação de dados leva os apelidos.

**Leitura da fatura**

- **Um leitor por banco,** que entrega as linhas para a mesma revisão da planilha modelo. O primeiro é o do CSV do Nubank. Na tela Importar, a pessoa escolhe a origem: "Planilha modelo" ou "Fatura do cartão Nubank (.csv)".
- **O mês de referência é o da fatura.** A tela pede o vencimento da fatura, já preenchido quando o nome do arquivo o traz (`Nubank_2026-11-04.csv`), e todas as compras entram no mês dele, vencendo nesse dia. A data de cada compra vai para o campo novo.
- **Cada compra** vem com:
  - o tipo Saída, a data da compra e o meio Crédito ([ADR 0054](0054-meio-de-pagamento.md));
  - o estabelecimento pelo apelido;
  - a categoria sugerida pelo histórico desse estabelecimento ([ADR 0053](0053-estabelecimentos.md)), que pode ser corrigida como hoje.
- **Linhas com regra própria:**
  - "Pagamento recebido" é o pagamento da fatura anterior, não uma entrada. Vem desmarcada, com o motivo.
  - Um valor negativo que não seja pagamento, como um estorno (o "IOF de volta"), vem como **entrada**, com um aviso. A pessoa pode desmarcar a compra e o estorno juntos.
- **Parcelas** ("Parcela n/N" no título):
  - **Se já existe um parcelamento** com o mesmo estabelecimento (ou descrição), N parcelas, o valor da parcela e a parcela n, a linha vem desmarcada como "já lançada".
  - **Se não existe,** a importação **cria o parcelamento** com as parcelas que faltam, de n a N, no valor da linha, a primeira no mês da fatura e uma por mês depois, vencendo no dia da fatura.
  - **Numeração:** o parcelamento ganha a **parcela inicial** (`firstNumber`, 1 por padrão), e o app mostra "Parcela 3/10" a "10/10", como a fatura. O mesmo campo serve para criar à mão um parcelamento já em andamento.
  - A última parcela (n = N) vira um lançamento simples, com "Parcela N/N" nas observações.
- **Não contar duas vezes:**
  - Se o mês já tem uma compra com a mesma data, o mesmo valor e o mesmo estabelecimento (ou título), a linha vem desmarcada como "possivelmente já importada".
  - Se o mês já tem um lançamento de cartão com valor perto do total da fatura, a revisão avisa que a fatura já parece lançada inteira, e a pessoa escolhe.
- **A importação continua tudo ou nada,** numa escrita só ([ADR 0040](0040-importacao-da-planilha.md)), agora com os parcelamentos e os apelidos novos. "Desfazer" apaga os lançamentos e os parcelamentos criados por ela e mantém os apelidos e os estabelecimentos, como já faz com os estabelecimentos.

## Consequências

- **O lançamento ganha uma terceira data.** Os rótulos "Data da compra", "Vencimento" e "Pago em" precisam ficar claros no formulário. Numa compra no Pix ou no dinheiro, a data da compra e o "pago em" costumam ser o mesmo dia: o formulário pode sugerir, sem preencher sozinho.
- **Outros bancos** entram com um leitor novo, sem mudar a revisão. O OFX, formato padrão que vários bancos exportam, fica para avaliar quando o segundo banco aparecer.
- **Contas e cartões com saldo e fatura** continuam fora ([ADR 0054](0054-meio-de-pagamento.md)): a fatura é só a origem dos lançamentos, não uma entidade nova.
- **Passos, um por PR:**
  1. Docs: este ADR, o glossário e o roadmap.
  2. API: a data da compra nos lançamentos, na planilha modelo (coluna "Data") e na exportação.
  3. Tela: a data no formulário, na linha e na tabela (com prévia).
  4. API: os apelidos (tabela, rotas, exportação) e a parcela inicial no parcelamento.
  5. Tela: os apelidos em Estabelecimentos e no seletor; a parcela inicial no "Parcelado".
  6. API: a importação aceita parcelamentos, apelidos e a data, na mesma escrita.
  7. Tela: o leitor do CSV do Nubank e a revisão, com as regras acima.

## Nota (a data da compra na API, 2026-10-17)

- **`transactions.occurred_on`** (só o dia, opcional) entra nas rotas de lançamentos, na importação e na exportação de dados. Lançamentos antigos, meses de recorrência e parcelas ficam sem data.
- **A planilha modelo ganha a coluna "Data",** entre "Valor" e "Vencimento", lida como o vencimento (dd/mm/aaaa ou uma célula de data). Uma planilha sem a coluna é lida como antes.
- **As partes de uma divisão** ganham a mesma data do lançamento dividido e a acompanham numa mudança, como o vencimento ([ADR 0052](0052-divisao-em-entradas-recorrencias-e-parcelamentos.md)).
