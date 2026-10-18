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

## Nota (a data da compra na tela, 2026-10-17)

- **Formulário:** "Data da compra (opcional)" numa saída e "Data (opcional)" numa entrada, entre o valor e o vencimento, em duas colunas a partir de 640 px. Vem com hoje num lançamento novo do mês atual e em branco num mês passado ou futuro. Some com "Todo mês", "Todo ano" ou "Parcelado", porque os meses e as parcelas nascem sem data.
- **Lista:** "Compra em 28/09" (ou "Em 03/10", numa entrada) antes do vencimento, com o ano só quando não é o do mês de referência.
- **Tabela:** uma coluna "Data" própria antes do vencimento, que também ordena. Na prévia foram descartadas a data dentro da coluna do vencimento (a linha ficava mais alta) e embaixo da descrição (sem ordenar e menos à vista).
- **Revisão da importação:** a data aparece na linha e pode ser corrigida em "Editar".

## Nota (apelidos e parcela inicial na API, 2026-10-18)

- **Apelidos:** a tabela `merchant_aliases` (com RLS) guarda o texto como foi digitado e a forma limpa (`normalized`), única no espaço. A rota `POST …/merchants/:merchantId/aliases` acrescenta um apelido e devolve o estabelecimento com todos os seus; `DELETE …/aliases/:aliasId` remove um. Um apelido de outro estabelecimento é recusado com o nome dele (409 `MERCHANT_ALIAS_EXISTS`), e um apelido que fica vazio depois da limpeza (só "Parcela 1/2") é recusado como inválido. A lista de estabelecimentos devolve os apelidos, e a exportação os leva.
- **A comparação** fica em `packages/shared` (`normalizeStatementTitle` e `findMerchantByAlias`), para o leitor da fatura usar no navegador.
- **Parcela inicial:** `installment_plans.first_number` (1 por padrão, com CHECK de 1 até o número de parcelas). Com 3 de 10, o parcelamento cria só as parcelas 3 a 10, cada lançamento com o seu número de verdade, e as partes de uma divisão dizem "(3/10)".
- **O valor de um parcelamento em andamento** é o das parcelas criadas: "da parcela" é cada uma delas, e "total" é a soma delas (o que falta pagar), não o da compra inteira. É o que a fatura mostra e o que a pessoa sabe; o total da compra inteira incluiria parcelas que o app não tem.
- **Mudar a parcela inicial** refaz as parcelas, como mudar os valores, e só enquanto nenhuma foi paga e o parcelamento não é dividido.

## Nota (a data da compra no parcelamento, 2026-10-18)

A decisão de criar as parcelas sem data foi revista: uma compra parcelada aconteceu num dia de verdade, o mesmo para todas as parcelas, e é esse dia que a fatura mostra ao lado de "Parcela 3/10". A recorrência continua sem data, porque cada mês dela é uma cobrança nova.

- **O parcelamento guarda a data da compra** (`installment_plans.occurred_on`, opcional), e cada parcela e cada parte de uma divisão a recebem ao serem criadas.
- **Mudar a data** no parcelamento chega às parcelas pendentes e às partes pendentes delas; as pagas ficam como estão, como as outras mudanças do parcelamento.
- **Na tela,** o "Parcelado" volta a mostrar a "Data da compra" (no PR da tela do parcelamento). A exportação de dados leva a data.

## Nota (a parcela inicial e a data da compra no "Parcelado", 2026-10-18)

- **No "Parcelado"** do novo lançamento, "Começa na parcela (opcional)" fica ao lado de "Parcelas" (em branco, é a primeira). A prévia diz quais serão criadas: "Da 3/10 à 10/10: 8 parcelas de R$ 50,00, total R$ 400,00." Um número acima do total de parcelas é recusado no próprio formulário.
- **A "Data da compra"** continua no "Parcelado", como num lançamento avulso, e vai para todas as parcelas. Com "Todo mês" ou "Todo ano" ela some.
- **Na edição do parcelamento,** a data da compra muda a qualquer momento; a parcela inicial muda como o valor e as parcelas (só sem parcela paga e sem divisão).
- **Em Recorrências,** um parcelamento criado em 3/10 conta as pagas com as anteriores ("3 de 10 pagas": a 1/10 e a 2/10 já tinham sido cobradas) e diz quais parcelas tem, ao lado das pagas: "Da 3/10 à 10/10". O valor continua "total em 8 de R$ 50,00".

## Nota (a data num mês de recorrência, 2026-10-18)

- **Editar um mês de recorrência** (Todo mês ou Todo ano) não oferece a "Data da compra" / "Data": cada mês é uma cobrança nova, e quem diz o dia é o vencimento.
- **A exceção é o mês que já tem uma data,** como o primeiro mês que veio de "Tornar recorrente", que mantém a do lançamento avulso. Ele mostra o campo enquanto tiver a data, para corrigi-la ou apagá-la; apagada, o campo some.

## Nota (os apelidos na tela, 2026-10-18)

- **Na lista de Estabelecimentos, só a contagem:** "2 apelidos" ao lado do nome. Na prévia, mostrar "Também aparece como: …" embaixo do nome foi descartado, porque deixava os cartões com alturas diferentes; a contagem mantém os cartões iguais.
- **"Apelidos", no menu ⋯** de um estabelecimento ativo (entre "Renomear" e "Arquivar"), abre um diálogo que lista os apelidos, cada um com "Remover", e tem o campo "Novo apelido". Um apelido de outro estabelecimento mostra o nome dele na recusa.
- **A busca da página e o seletor do lançamento** encontram também pelo apelido. No seletor, quando foi o apelido que bateu, ele aparece embaixo do nome.

## Nota (a importação com parcelamentos e apelidos, 2026-10-18)

- **Numa só requisição:** a importação recebe, além dos lançamentos, os parcelamentos (`plans`, cada um como a linha da fatura: o valor da parcela, o total de parcelas, a parcela inicial e o mês da primeira) e os apelidos aprendidos na revisão (`aliases`, o texto com o nome do estabelecimento).
- **Os parcelamentos entram na mesma escrita** dos lançamentos, ligados à importação (`installment_plans.import_id`): desfazer a importação apaga o parcelamento com as parcelas.
- **Os apelidos são conferidos antes de gravar qualquer coisa:** um que já é de outro estabelecimento recusa a importação inteira, com o nome dele; um que o estabelecimento já tem, ou repetido no lote, é ignorado. Como os estabelecimentos, eles ficam quando a importação é desfeita.
- **A contagem da importação** soma os lançamentos e as parcelas criadas, e os meses vão do primeiro ao último de todos eles.
- **Recorrências não são importadas:** uma fatura não diz se uma cobrança se repete. O caminho continua sendo "Tornar recorrente" depois de importar.
- **Não contar duas vezes com uma recorrência:** se o mês da fatura já tem o lançamento pendente de uma recorrência com o mesmo estabelecimento (ou a mesma descrição) e valor próximo, a revisão traz a linha da fatura desmarcada, "já lançada pela recorrência", mostrando a diferença de valor. A importação não altera o lançamento da recorrência (assim "Desfazer" continua simples); ajustar o valor real é feito nele, em Lançamentos. A regra é da revisão, no passo 7: os meses de recorrência não têm data da compra, e a comparação por data não os pegaria.
- **Uma escolha vale para as linhas iguais:** escolher (ou criar) o estabelecimento de uma linha sem correspondência aplica a mesma escolha às outras linhas da mesma fatura com o mesmo título limpo, como três pedidos na mesma pizzaria. Regra da revisão, no passo 7.

## Nota (o leitor do CSV do Nubank, 2026-10-18)

- **Um leitor por banco, sem tela:** `parseNubankCsv` (em `packages/shared/src/statement.ts`) recebe o texto do arquivo e devolve linhas num formato comum a todos os bancos (`StatementLine`): a data da compra, o título como veio, o título limpo (sem a parcela), o valor sempre positivo, a parcela n/N e o que a linha é. Um banco novo é outro leitor que devolve as mesmas linhas.
- **O que a linha é:** valor positivo é compra; negativo com "Pagamento recebido" (ou "Pagamento em") é o pagamento da fatura anterior; outro negativo é estorno, que vira entrada na revisão.
- **Leitura tolerante:** as colunas são achadas pelo título, em qualquer ordem; o valor vem em texto brasileiro, com ou sem espaço depois do sinal; a data aceita `2026-10-16` e `16/10/2026`; o BOM e as quebras de linha do Windows não atrapalham. Uma linha ilegível fica de fora com o motivo, e um valor zero é ignorado.
- **"Parcela n/N" só quando faz sentido:** n de 1 a N e N de 2 em diante; fora disso, a linha é uma compra comum.
- **O vencimento** vem do nome do arquivo quando ele o traz (`Nubank_2026-11-04.csv`, `statementDueDateFromFileName`); sem ele, a tela pede.

## Nota (a origem e a revisão da fatura, 2026-10-18)

- **"Origem":** cada importação pode ter um nome digitado (`imports.label`, até 100 caracteres), sugerido como "Fatura Nubank" ou "Planilha modelo" e trocável ("Cartão Nubank do Diego"). O nome do arquivo não serve: ele não identifica a fatura para quem lê. A importação de uma fatura guarda também o vencimento (`imports.statement_due_date`), e a lista mostra "Fatura Nubank · vence 04/11/2026", com quantos lançamentos e parcelamentos ela criou.
- **A mesma fatura pode ser importada de novo,** por exemplo cinco dias depois, numa fatura ainda aberta: o que já entrou vem desmarcado ("possivelmente já importada", "já lançada"), e só as compras novas entram. Cada importação fica separada, e desfazer a segunda tira só o que ela trouxe.
- **A descrição de uma compra com estabelecimento é o nome dele** ("Pizzaria Exemplo"), não o texto do extrato ("Ifd*Pizzaria Exemplo"), escolhido na prévia: a lista de Lançamentos fica igual à de quem lança à mão, e o texto do extrato aparece na revisão, para conferir. Sem estabelecimento, a descrição é o texto do extrato sem a parcela. Em qualquer caso, ela pode ser trocada em "Editar".

## Nota (a tela da fatura, 2026-10-18)

- **"Importar"** (antes "Importar planilha", também no menu "Mais") começa por "De onde vêm os lançamentos?": "Planilha modelo", como antes, ou "Fatura Nubank" (o seletor de arquivo diz ".csv"). O vencimento vem do nome do arquivo; sem ele, é pedido antes da revisão, num passo próprio. Mudar o vencimento é escolher o arquivo de novo: as comparações dependem do mês.
- **A revisão** mostra o vencimento e o mês de referência, a "Origem" (já com "Fatura Nubank", ou "Planilha modelo") e os avisos (fatura lançada inteira, linhas do arquivo que não puderam ser lidas). Cada linha diz o que vai virar ou por que vem desmarcada, e "No extrato: …" mostra o texto do banco quando a descrição é o nome do estabelecimento.
- **A fatura pode ser importada de novo sem o aviso de meses repetidos** da planilha: o que já entrou vem desmarcado linha a linha.
- **"Editar" de uma linha da fatura** escolhe o estabelecimento no seletor (com "Adicionar 'Nome'") e oferece "Lembrar como apelido", marcado quando o estabelecimento não veio de um apelido, com o texto da linha sem a parcela para encurtar. Um estabelecimento escolhido numa linha sem nenhum passa a ser a descrição, se ela não foi trocada ali. O formulário diz quantas outras linhas de mesmo texto recebem a escolha.
- **Uma linha da fatura sem categoria escolhe a categoria no próprio cartão** (numa primeira fatura, quase nenhuma linha tem histórico), e a escolha vai para as linhas de mesmo texto. Uma linha desmarcada por uma regra mostra só o motivo; marcada, mostra o que falta, e a caixa nunca fica travada.
- **O botão** conta os lançamentos e os parcelamentos ("Importar 7 lançamentos e 1 parcelamento"); o resumo soma, de um parcelamento, só a parcela desta fatura.
- **Valor "próximo" de uma recorrência** é até 10% de diferença; **"perto do total"** da fatura é até 5%.

## Nota (o mês da compra e o vencimento digitado, 2026-10-18)

O primeiro teste com uma fatura real mostrou duas coisas, e a regra do mês foi revista antes do uso.

- **As compras entram no mês da compra,** não no da fatura: a decisão inicial (opção 1, "no mês da fatura") é trocada pela opção 2. O que importa para quem acompanha o mês é quanto gastou nele; a data da compra é a do consumo, e o vencimento continua dizendo quando o dinheiro sai. A pizza de 03/10, numa fatura que vence em 04/11, entra em outubro, "Vence em 04/11".
- **Uma parcela entra no mês da compra mais o número dela:** a "Parcela 3/10" de uma compra de 28/08 entra em outubro, vencendo no dia da fatura, e o parcelamento criado vence cada parcela no mês seguinte ao dela (`dueMonthOffset` 1). Uma compra feita depois do fechamento, que só vence dois meses depois, começa o parcelamento um mês depois, porque um parcelamento vence no máximo no mês seguinte.
- **Consequência no Painel:** o "Saldo previsto" de outubro passa a ter as compras do cartão de outubro, pendentes até o pagamento em novembro.
- **Uma fatura cobre vários meses,** então a revisão lê os lançamentos de cada mês envolvido para as comparações ("já importada", "já lançada pela recorrência"), e cada comparação olha só o mês da linha.
- **O vencimento é sempre digitado,** com o campo vazio: o nome do arquivo não é uma fonte confiável (pode ter sido renomeado, e não se sabe se a data dele é sempre a do vencimento). `statementDueDateFromFileName` saiu.
- **O estabelecimento é opcional e diz isso:** "Sem estabelecimento" deixou de ser um aviso com o ícone dos problemas, ao lado de "Escolha a categoria.", e virou uma dica em texto apagado, "Sem estabelecimento (opcional). Escolha um em 'Editar' para a próxima fatura já vir com ele.", só numa linha que já tem categoria.

## Nota (o mês de referência da fatura, 2026-10-18)

O segundo teste mostrou que o mês da compra também não serve: uma compra de 29/09, feita depois de o cartão virar, está na fatura de outubro e pertence a outubro. O cartão segue o **ciclo da fatura**, não o mês do calendário. A regra fica:

- **Um mês de referência para a fatura inteira,** escolhido na revisão: todas as linhas entram nele, as compras, o estorno e as parcelas cobradas nesta fatura. É o mês do ciclo (outubro), não o do vencimento (novembro), como era na primeira decisão.
- **Sugerido pelo mês da compra mais recente** da fatura, perto do fechamento; as parcelas ficam de fora da sugestão, porque a data delas é a da compra original. A pessoa troca se precisar, e uma linha isolada ainda pode ir para outro mês em "Editar".
- **Uma parcela cobrada nesta fatura começa o parcelamento no mês de referência,** e as próximas seguem mês a mês, cada uma vencendo no dia da fatura, tão longe do mês dela quanto esta (`dueMonthOffset` 0 ou 1). Um vencimento mais longe que o mês seguinte recusa o parcelamento, com o motivo. O "mês da compra + número da parcela" e o caso da compra depois do fechamento saíram.
- **O vencimento é digitado na revisão,** ao lado do mês e da "Origem", e não num passo antes dela: a revisão abre logo depois de escolher o arquivo, e "Importar" fica bloqueado até o vencimento ser informado.
- **Trocar o mês ou o vencimento refaz a revisão** (as comparações "já importada" e "já lançada pela recorrência" passam a olhar o novo mês), e uma linha em que a pessoa já mexeu (marcou, escolheu categoria ou estabelecimento, editou) mantém as escolhas dela (`mergeStatementRows`).
- **A visão continua sendo a do consumo:** quase todas as compras de uma fatura de outubro são de outubro; só as feitas entre o fechamento e a virada do mês mudam, para o mês em que aparecem na fatura.
