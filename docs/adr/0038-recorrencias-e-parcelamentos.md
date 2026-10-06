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
