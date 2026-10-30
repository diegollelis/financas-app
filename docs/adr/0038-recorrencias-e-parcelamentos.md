# 0038 — Recorrências geradas ao abrir o mês; parcelamentos gerados de uma vez

- **Status:** Aceita
- **Data:** 2026-10-06

## Contexto

Boa parte dos lançamentos de um mês se repete: energia, internet, aluguel e fatura do cartão. Outros vêm de uma compra parcelada ("Parcela 04 de 08"). Na planilha de origem, as duas coisas viviam só no texto e eram copiadas à mão todo mês ([planilha de origem](../dominio/planilha-origem.md), problema 6). O [modelo de domínio](../dominio/modelo.md) já previa `Recurrence` e `InstallmentPlan`.

Uma recorrência **não tem fim**, então não dá para gerar todos os lançamentos dela de uma vez. Um parcelamento tem fim.

## Opções consideradas

**Quando uma recorrência vira lançamento**

1. **Gerar 12 meses à frente** ao criar, com uma rotina que renova a janela: os meses futuros já aparecem cheios, mas mudar o valor estimado exige atualizar muitos lançamentos, e o plano gratuito do Render não tem rotina agendada.
2. **Gerar ao abrir o mês:** quando uma competência é lida (Lançamentos, Painel, Análise), a API cria o lançamento pendente de cada recorrência ativa que ainda falta ali.

**Como não gerar duas vezes nem regerar o que foi excluído**

1. Uma chave única `(recurrence_id, period)` no próprio lançamento: excluir o lançamento apagaria a marca, e o mês seria gerado de novo.
2. **Uma tabela de ocorrências:** uma linha por recorrência e competência gerada, criada **na mesma escrita** que o lançamento, que continua existindo quando o lançamento é excluído.

## Decisão

- **Recorrências geradas ao abrir o mês** (opção 2), com o valor estimado e pendentes; a pessoa ajusta o valor real e efetiva.
  - `TransactionsService.list` (que serve Lançamentos e o Painel) e `AnalysisService.get` (cada competência do intervalo) chamam `RecurrencesService.materialize` antes de ler.
  - A competência inicial é gerada já na criação, para o lançamento aparecer no mês que está na tela.
  - Uma recorrência que nunca chega a um mês (início depois ou fim antes) não gera nada nele.
- **Tabela `recurrence_occurrences`** (opção 2):
  - a chave primária é `(recurrence_id, period)`;
  - `transaction_id` é único e usa `ON DELETE SET NULL`;
  - a ocorrência e o lançamento nascem numa **escrita aninhada só** do Prisma (atômica);
  - abrir o mesmo mês duas vezes ao mesmo tempo esbarra na chave, e a segunda tentativa é ignorada (`P2002`);
  - **excluir um lançamento gerado deixa a ocorrência sem lançamento**, e o mês não volta a ser gerado.
- **O dia do vencimento** (1 a 31) que o mês não tem cai no último dia (31 em fevereiro → dia 28 ou 29), calculado por `dueDateIn` em `packages/shared`.
- **Mudar e encerrar só tocam os pendentes do mês atual em diante.** Os efetivados e os meses passados são histórico.
  - **Mudar** (valor, descrição, categoria, observações, dia) atualiza a recorrência e esses pendentes. O tipo e o início não mudam; para isso, encerra-se e cria-se outra.
  - **Encerrar** remove esses pendentes e marca `end_period` como o mês anterior. Uma recorrência que nunca chegou ao mês atual é apagada; os lançamentos que já tinham sido efetivados ficam, só sem o vínculo.
- **Mesmas garantias dos lançamentos:**
  - RLS nas duas tabelas novas ([ADR 0028](0028-row-level-security.md));
  - chave estrangeira composta com a categoria (mesmo espaço e mesmo tipo, [ADR 0029](0029-lancamentos-e-integridade-no-banco.md));
  - CHECKs de valor positivo, dia de 1 a 31, competências válidas e fim não antes do início.
- **Parcelamentos** (próximo PR): gerados todos de uma vez ao criar, porque têm fim. O valor é digitado como total ou como valor da parcela; com o total, a diferença de centavos vai para a última parcela.

## Consequências

- **Abrir um mês pode escrever no banco.** É idempotente e invisível para quem lê, mas significa que uma leitura (`GET`) tem efeito. Está registrado aqui e coberto por testes (abrir duas vezes, abrir ao mesmo tempo, mês excluído não volta).
- **Mudar uma recorrência sobrescreve ajustes manuais** feitos num pendente do mês atual em diante. Os efetivados não mudam.
- **Uma categoria usada por uma recorrência não pode ser excluída,** só arquivada, como uma categoria com lançamentos.
- **O teste `rls-coverage`** passou a exigir RLS e política em toda tabela com `workspace_id`, para nenhuma tabela nova sair sem elas.
- **Revisar** se um dia houver rotina agendada (plano pago) ou recorrências com outra frequência (semanal, anual).

## Nota ("Repetir" no "Novo lançamento", 2026-10-06)

- **O formulário de "Novo lançamento" ganhou "Repetir"** (`SegmentedControl` Não repetir | Todo mês). Com "Todo mês", ele cria uma recorrência que começa na competência na tela, em vez de um lançamento avulso. O dia do vencimento vem do dia da data informada. A API já cria o lançamento deste mês.
  - Toast: "Lançamento adicionado, repetindo todo mês".
  - "Repetir" só aparece ao criar; ao editar, não.
- **Selo "Todo mês"** nas linhas geradas por uma recorrência (o lançamento traz `recurrenceId`).
- **No menu "⋯" de um lançamento gerado:**
  - "Encerrar recorrência", com confirmação. Os pendentes deste mês em diante saem; os anteriores e os efetivados ficam.
  - "Excluir só este mês", e a confirmação avisa que esse mês não volta a ser gerado.
- **Editar um mês gerado avisa** que a mudança vale só para aquele mês; a recorrência não muda.
- "Parcelado" entra no mesmo campo quando a API de parcelamentos existir.

## Nota (valor variável, 2026-10-06)

- **Contas que variam** (energia, água, gás): a recorrência ganha `variable_amount`. Cada mês novo nasce com a **média dos últimos 3 lançamentos efetivados dela em meses anteriores** (`estimateAmount` em `packages/shared`). Sem histórico, vale o valor digitado.
  - Usamos a média, e não o último valor, porque um mês atípico (um verão com ar-condicionado) pesa menos na estimativa do seguinte.
- **O lançamento gerado nasce como estimativa** (`transactions.amount_estimated`). Ele deixa de ser estimativa quando o valor é informado (`PATCH` com `amountCents`) ou quando é efetivado. Desfazer a efetivação não volta a estimar.
- **Mudar o valor da recorrência** alcança só os meses ainda estimados; um mês cujo valor real já foi informado fica com ele. Tornar a recorrência fixa transforma em valor as estimativas pendentes.
- **Painel:** o resumo traz `estimatedCents`, a soma dos pendentes ainda estimados, para dizer quanto do previsto é estimativa.
- **Tela** (próximo PR):
  - "Valor: Fixo | Variável" no "Repetir: Todo mês";
  - o aviso "Estimado" na linha;
  - "Efetivar" pede o valor da fatura nas contas estimadas.

## Nota (valor variável na tela, 2026-10-06)

- **No "Novo lançamento" com "Todo mês",** aparece "Valor: Fixo | Variável". Com "Variável", o campo vira "Valor estimado (R$)" e um aviso explica a média dos 3 últimos pagos.
- **Na linha,** um lançamento estimado mostra "Estimado" em texto discreto sob o valor. É texto, não um selo colorido, porque estimativa não é um status do lançamento.
- **"Efetivar" de uma conta estimada** abre a gaveta "Efetivar …" (`features/transactions/settle-with-amount.tsx`) com "Valor da fatura (R$)" já preenchido pela estimativa. Valor e data vão juntos num `PATCH`. As contas fixas continuam efetivando com um toque.
- **No Painel,** quando há estimativas pendentes, aparece "Inclui R$ X em valores estimados, de contas que variam." abaixo dos indicadores.

## Nota (parcelamentos na API, 2026-10-06)

- **Tabela `installment_plans`** (RLS, chave composta com a categoria):
  - campos: `total_cents`, `installments` (2 a 72), `first_period`, `due_day` e `ended_at`;
  - `transactions` ganhou `installment_plan_id` e `installment_number`, os dois preenchidos ou os dois nulos (CHECK), com chave única por plano e número.
- **Criar gera todas as parcelas de uma vez,** numa escrita aninhada com o plano: uma por competência a partir da primeira.
  - O valor pode ser o total (`amountIs: TOTAL`) ou o da parcela (`INSTALLMENT`, como a fatura mostra).
  - `splitInstallments` divide o total em partes iguais e põe na última os centavos que sobram (R$ 1.000,00 em 3 = 333,33 + 333,33 + 333,34). A soma sempre fecha.
- **A descrição de cada parcela é a da compra.** O "3/10" vem de `installment: { planId, number, count }` na resposta do lançamento. Assim, renomear uma parcela não quebra a numeração.
- **Encerrar** (`DELETE`) remove as parcelas pendentes do mês atual em diante e marca `ended_at`. As efetivadas e as de meses passados ficam. A lista traz `settledCount`, quantas já foram pagas.

## Nota (parcelado na tela, 2026-10-06)

- **"Repetir" ganhou "Parcelado"** (Não repetir | Todo mês | Parcelado). Com ele aparecem:
  - o campo "Parcelas" (2 a 72);
  - "O valor digitado é: Total | Da parcela", e o rótulo do valor acompanha a escolha;
  - uma prévia do que será criado, calculada com o mesmo `splitInstallments` da API ("3 parcelas: 2 de R$ 333,33 e a última de R$ 333,34, total R$ 1.000,00."). Assim, a pessoa vê os centavos da última antes de salvar.
- **A primeira parcela fica na competência da tela,** e o dia de vencimento vem da data informada, como na recorrência.
- **Selo "Parcela n/N"** nas linhas de um parcelamento.
- **Menu "⋯" de uma parcela:**
  - "Encerrar parcelamento", com confirmação; reaproveita o diálogo de "Encerrar recorrência", agora genérico;
  - "Excluir só esta parcela", que avisa que as outras continuam.
- **Editar uma parcela avisa** que a mudança vale só para ela.

## Nota (tela "Recorrências", 2026-10-06)

- **Página `/espacos/:workspaceId/recorrencias`, no "Mais"** (na barra lateral a partir de md). Duas seções:
  - "Todo mês": as recorrências ativas, e as encerradas abaixo, em "Encerradas";
  - "Parcelamentos": os em andamento, e abaixo, em "Encerrados e quitados", os encerrados e os com todas as parcelas pagas.
- **Cada linha mostra** tipo, categoria, dia de vencimento e desde quando (ou até quando) a recorrência vale. Num parcelamento, mostra quantas parcelas foram pagas e o mês da última. O valor fica à direita; uma recorrência variável traz "Varia todo mês".
- **Editar uma recorrência** (descrição, categoria, Fixo | Variável, valor, dia, observações) **envia só os campos que mudaram.** A API copia cada campo recebido para os pendentes deste mês em diante. Mandar um campo igual desfaria um mês ajustado à mão, por exemplo uma observação ou um valor corrigido. Sem mudança, o formulário fecha sem chamar a API.
- **Encerrar** pede confirmação, nas recorrências e nos parcelamentos, com o mesmo texto do menu de Lançamentos. O que é histórico (encerrado ou quitado) não tem menu, e VIEWERs só leem.
- **Parcelamentos não se editam:** as parcelas já existem. Para mudar uma, edita-se a parcela em Lançamentos; para quitar antes, encerra-se o parcelamento.

## Nota (vencimento no mês seguinte, 2026-10-14)

- **O problema:** a recorrência e o parcelamento guardavam só o dia do vencimento (`dueDay`), e cada mês gerado vencia no próprio mês. A conta de luz de outubro que vence em 10/11 passava a vencer em 10/10 já no primeiro mês, e aparecia "Atrasada" antes da hora. A fatura do cartão tem o mesmo jeito: a parcela de outubro vence em novembro.
- **Decisão:** `recurrences` e `installment_plans` ganham `due_month_offset` (0 ou 1, `CHECK`, padrão 0), quantos meses depois do mês de referência cada mês vence. O vencimento de um mês é `dueDateFor(período, dia, distância)` (`packages/shared/src/recurrence.ts`), e um dia que o mês não tem continua caindo no último dia.
- **Só até o mês seguinte:** cobre as contas de consumo e a fatura do cartão, e a edição fica com uma escolha simples ("Mesmo mês / Mês seguinte"). Um vencimento antes do mês de referência, ou dois meses depois, é recusado.
- **Os registros antigos ficam com 0,** como eram. Para corrigir uma recorrência criada antes, edita-se a distância, e a API recalcula o vencimento dos pendentes deste mês em diante, como já fazia com o dia. Os pagos e os meses passados ficam como estão.
- **"Tornar recorrente"** tira a distância da data do próprio lançamento, e um lançamento que vence longe demais do seu mês é recusado (`NOT_REPEATABLE`).
- **Na tela,** o formulário calcula o dia e a distância da data digitada em "Todo mês" e "Parcelado". O lançamento avulso continua aceitando qualquer data.

## Nota (editar e excluir um parcelamento, 2026-10-15)

- **O problema:** um parcelamento não se editava, nem para trocar a categoria ou corrigir a descrição; e encerrar um sem nenhuma parcela paga deixava um item em "Encerrados e pagos" que nada tinha de pago.
- **Editar (`PATCH …/installments/:planId`):**
  - descrição, observações, categoria, pessoa, estabelecimento, meio de pagamento, dia do vencimento e "Vence no" mudam a qualquer momento, no parcelamento e nas parcelas **pendentes**; as pagas são histórico e ficam como estão;
  - os valores (total ou valor da parcela, número de parcelas, mês da primeira) só mudam **enquanto nenhuma parcela estiver paga e o parcelamento não estiver dividido**: as parcelas são refeitas do zero, como se tivesse acabado de ser criado. Com parcela paga, `PLAN_HAS_PAYMENTS`; dividido, `PLAN_IS_SPLIT` (refazer as partes de cada pessoa em cada parcela fica para outra vez, como na recorrência dividida);
  - um parcelamento encerrado não muda mais (`PLAN_ENDED`).
- **Excluir em vez de encerrar:** sem nenhuma parcela paga não há histórico a guardar, então `DELETE …/installments/:planId` apaga o parcelamento com **todas** as parcelas, também as de meses anteriores, e as partes pendentes de uma divisão (uma parte já recebida fica, solta). Com alguma parcela paga, continua encerrando como antes. Um parcelamento já encerrado sem nada pago também pode ser excluído assim.
- **O histórico com algo pago fica:** a recorrência ou o parcelamento encerrado com lançamentos pagos continua em Recorrências, porque esses vínculos são o histórico.

## Nota (recorrência anual, 2026-10-16)

O dono precisou lançar o que se repete uma vez por ano (IPVA, IPTU, anuidade, seguro). A Decisão já previa revisar o desenho para outra frequência.

- **`interval_months` na recorrência,** 1 (todo mês, o padrão) ou 12 (todo ano), com CHECK. As recorrências existentes ficam mensais. Guardar o intervalo em meses deixa espaço para trimestral ou semestral, se aparecerem, liberando só um valor.
- **Só o mês do ciclo é gerado:** uma anual tem lançamento no mês do início e a cada 12 meses (`isRecurrenceMonth`, em `packages/shared`). O resto do motor não muda: o lançamento nasce ao abrir o mês, o vencimento usa o dia e "Vence no", o valor variável é a média dos 3 últimos pagos (numa anual, os 3 últimos anos), e mudar ou encerrar toca só os pendentes deste mês em diante.
- **A frequência não se altera,** como o tipo e o início: para mudar, encerre e crie outra. "Tornar recorrente" também aceita `intervalMonths`.
- **O lançamento diz a frequência** (`recurrenceIntervalMonths`), para o selo "Todo mês" ou "Todo ano".
- **No orçamento, a anual entra só no mês em que cai,** como qualquer lançamento. Reservar 1/12 por mês (provisão) fica para um ADR próprio, se a necessidade aparecer.
- **Na tela,** "Todo ano" entra em "Repetir" no "Novo lançamento" (quatro opções, em duas linhas no celular) e em "Tornar recorrente". Em Recorrências, a seção "Todo mês" passa a se chamar "Recorrentes"; cada linha diz a frequência ("Todo ano em março") e uma anual mostra "Próximo: março de 2027"; na tabela, a frequência e o vencimento dividem a coluna "Repete" (uma coluna a mais apertava a descrição); e o total "Por mês" soma só as mensais, com "Por ano" à parte.

## Nota (o período de uma encerrada, 2026-10-18)

- **Uma recorrência encerrada mostra do primeiro ao último mês:** "Janeiro a maio de 2026", "Outubro de 2025 a março de 2026" ou "Em maio de 2026", na lista e na coluna "Período" da tabela de Recorrências. Antes mostrava só "Até maio de 2026", e o início, que continua gravado (`startPeriod`), sumia da tela.
- **Uma ativa continua com "Desde outubro de 2026"** (ou "A partir de…", quando começa num mês futuro).
- **Não há data de início digitada:** o mês de início já decide a geração, e o dia de cada mês está no vencimento.

## Nota (tornar parcelado, 2026-10-19)

O dono importou pela planilha uma compra que era parcelada e não tinha como transformá-la em parcelas. Agora, como o "Tornar recorrente", um lançamento avulso pode virar parcelamento: `POST …/installments/from-transaction { transactionId, installments, firstNumber?, amountIs }`.

- **O lançamento é adotado como uma das parcelas,** a de número `firstNumber` (1 por padrão), no mês dele, sem duplicar; as seguintes nascem pendentes, uma por mês. O parcelamento leva tudo do lançamento: descrição, observações, categoria, pessoa, estabelecimento, meio de pagamento, data da compra e o dia do vencimento, no mesmo mês ou no seguinte, como ele.
- **O valor:** "parcela" repete o valor dele em todas; "total" divide como um parcelamento novo, com os centavos que sobram na última, e o valor dele passa a ser o da parcela dele.
- **Recusas (409 `NOT_INSTALLABLE`):** um lançamento que já é parcela ou de uma recorrência, uma parte de divisão, um lançamento dividido e um já pago informado como total (o valor dele mudaria). A última parcela não tem outras depois e é recusada como entrada inválida.
- **Uma só escrita:** o parcelamento com as parcelas seguintes e a adoção do lançamento ficam numa transação interativa com o contexto do RLS ([ADR 0028](0028-row-level-security.md)), porque o Prisma não cria o parcelamento pelo lado da parcela já existente.

Na tela: o menu de um lançamento avulso, não dividido e que não é parte, oferece "Tornar parcelado" (`features/installments/install-dialog.tsx`). O diálogo pede as parcelas, "Este lançamento é a parcela (opcional)" e se o valor é "Da parcela" ou "Total" (um lançamento já pago fica só como valor da parcela, com a explicação). Antes de confirmar, ele mostra a prévia do formulário ("Da 3/10 à 10/10: 8 parcelas de R$ 50,00, total R$ 400,00"), que passou para `features/installments/preview.ts` e serve aos dois.

## Nota (o lançamento adotado volta a ser avulso, 2026-10-19)

Um teste do dono mostrou que encerrar uma recorrência criada pelo "Tornar recorrente" excluía também o lançamento que ela tinha adotado: ele era deste mês e estava pendente, e a recorrência não sabia que ele existia antes dela. O mesmo valia para o "Tornar parcelado" ao excluir ou encerrar o parcelamento.

- **A recorrência e o parcelamento guardam o lançamento adotado** (`adopted_transaction_id`, sem chave estrangeira: um lançamento excluído deixa um id que não acha nada). O parcelamento guarda também o valor que ele tinha (`adopted_amount_cents`), porque o "Total" troca o valor pelo da parcela.
- **Encerrar a recorrência** devolve o adotado como avulso, com as partes dele, se ainda estiver pendente e for deste mês em diante (o vínculo da ocorrência é desfeito). **Excluir ou encerrar o parcelamento** o devolve como avulso, com o valor de antes; ao excluir um sem nada pago, mesmo que seja de um mês passado, porque tudo some; ao encerrar um com parcelas pagas, só deste mês em diante, porque o passado fica como histórico. Um adotado já pago continua no histórico, como antes.
- **Refazer as parcelas** (mudar valor, quantidade ou parcela inicial com nada pago) recria todas, inclusive a adotada, que deixa de ser o lançamento de antes: a marca é apagada.
- **O que já existia:** a migração marca as recorrências do "Tornar recorrente" anteriores à coluna. O adotado é o lançamento do primeiro mês criado antes da recorrência; um mês gerado é sempre criado depois dela.
- As respostas trazem `adoptedTransactionId`, e os diálogos de encerrar e excluir (em Lançamentos e em Recorrências) acrescentam: "O lançamento que já existia antes continua, como avulso, se ainda estiver pendente."

## Nota (último valor pago e estimativa na lista, 2026-10-29)

Na tela "Recorrências", o card de uma recorrência variável mostrava o valor digitado na criação, que nunca muda, e o total "Por mês" somava esse valor. Cada mês, porém, começa da média dos 3 últimos pagos. O que a tela mostrava era um palpite antigo.

- **`GET /recurrences` traz o histórico de cada uma:** `lastSettled` (`{ period, amountCents }` do último mês pago ou recebido, `null` sem nenhum) e `estimateCents` (só na variável: de onde o próximo mês começa, a mesma `estimateAmount` da geração, com o valor digitado enquanto nada foi pago; `null` na fixa). As respostas de criar, alterar e "Tornar recorrente" trazem os dois também.
- **Uma consulta para todas:** os lançamentos pagos ligados às ocorrências das recorrências do espaço, do mais novo para o mais antigo. Nada é guardado: o histórico é o dos próprios lançamentos, como no resumo do mês (ADR 0031).
- Na tela, a variável passa a mostrar o último pago como valor principal, com a média embaixo, e os totais usam a estimativa.
- **A tela (2026-10-29):** a busca percorre recorrências e parcelamentos (descrição, categoria, pessoa, estabelecimento, meio, observações ou valor); as ativas ficam em "Todo mês" e "Todo ano", cada grupo com os totais em cards como o resumo de Lançamentos (Saídas, Entradas e Saldo, com a parte estimada embaixo), depois "Recorrências encerradas" e "Parcelamentos". A variável mostra "Último pago em setembro" e "Média: R$ X"; sem nada pago, "Estimado, varia todo mês".
