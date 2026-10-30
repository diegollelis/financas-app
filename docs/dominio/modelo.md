# Modelo de domínio

Modelo conceitual inicial. O schema definitivo nasce no Prisma, nas fases 2 e 3 do [roadmap](../roadmap.md). Nomes em inglês ([ADR 0011](../adr/0011-idioma-do-codigo.md)); veja o [glossário](glossario.md).

## Entidades

### User

Pessoa autenticada. As tabelas `users`, `sessions`, `accounts` (senha em _hash_ ou conta OAuth) e `verifications` têm o formato exigido pelo Better Auth ([ADR 0007](../adr/0007-autenticacao-better-auth.md), [ADR 0020](../adr/0020-integracao-better-auth-nestjs.md)).

### Workspace (Espaço)

Dono de todos os dados financeiros ([ADR 0008](../adr/0008-multi-tenancy-por-espaco.md)).

- `id`, `name`, `is_personal`, `created_at`
- Todo usuário ganha um **espaço pessoal** ("Pessoal") no cadastro: é só dele, nunca é compartilhado nem excluído. Para dividir finanças, cria-se outro espaço ([ADR 0024](../adr/0024-espacos-membros-e-espaco-pessoal.md)).

### Member (Membro)

- `workspace_id`, `user_id`, `role` (`OWNER` | `EDITOR` | `VIEWER`)
- Único por (`workspace_id`, `user_id`). Todo espaço tem ao menos um `OWNER`.

### Category (Categoria)

- `workspace_id`, `name`, `type` (`CREDIT` | `DEBIT`), `archived_at`
- Único por (`workspace_id`, `type`, `name`), sem diferenciar maiúsculas de minúsculas ("mercado" = "Mercado"). O mesmo nome pode existir nos dois tipos (ex.: "Consórcio").
- O `type` não muda depois de criada: o lançamento precisa ter o mesmo tipo da categoria.
- Arquivada: continua nos lançamentos antigos, mas não é oferecida para novos. Pode ser reativada.
- Categorias em uso não são excluídas, só arquivadas (regra garantida pela chave estrangeira dos lançamentos, [ADR 0029](../adr/0029-lancamentos-e-integridade-no-banco.md)).
- Primeira tabela com Row Level Security ([ADR 0028](../adr/0028-row-level-security.md)).

### Transaction (Lançamento)

- `workspace_id`, `type` (`CREDIT` | `DEBIT`), `description`, `notes`, `category_id`
- `amount_cents` (> 0), `period` (competência `YYYY-MM`), `due_date` (opcional), `settled_at`, `occurred_on` (opcional: o dia da compra, que não muda a competência, [ADR 0055](../adr/0055-importacao-da-fatura-do-cartao.md))
- `installment_plan_id?`, `installment_number?`, `recurrence_id?`
- `external_id?`: o movimento do extrato da conta que o lançamento é ("NUBANK:<código>"), único no espaço; `reconciled_import_id?`: a importação que o encontrou já lançado e o quitou ou vinculou ([ADR 0061](../adr/0061-extrato-da-conta-e-conferencia.md))
- Regras:
  - a categoria pertence ao mesmo espaço e tem o mesmo `type` (garantido pelo banco, [ADR 0029](../adr/0029-lancamentos-e-integridade-no-banco.md)); categoria arquivada não pode ser escolhida;
  - status: **pendente** (`settled_at` nulo), **vencido** (pendente e `due_date` < hoje), **efetivado** (`settled_at` preenchido).

### InstallmentPlan (Parcelamento) — fase 5

- `workspace_id`, `description`, `total_cents`, `installments`, `first_period`
- Gera, ao ser criado, um `Transaction` por parcela (`installment_plan_id`, `installment_number`), uma por competência; o total pode ser digitado como total ou como valor da parcela, e a diferença de arredondamento vai para a última parcela ([ADR 0038](../adr/0038-recorrencias-e-parcelamentos.md)).
- Encerrar remove as parcelas pendentes do mês atual em diante; as pagas ficam.
- `first_number` (1 por padrão): a parcela inicial de uma compra já em andamento. Com 3 de 10, o app cria só as parcelas 3 a 10, numeradas como na fatura, e o valor (total ou da parcela) é o dessas parcelas ([ADR 0055](../adr/0055-importacao-da-fatura-do-cartao.md)).

### Recurrence (Recorrência) — fase 5 ([ADR 0038](../adr/0038-recorrencias-e-parcelamentos.md))

- `workspace_id`, `type`, `description`, `notes?`, `category_id`, `amount_cents` (valor estimado), `due_day?` (1 a 31; o dia que o mês não tem vira o último), `start_period`, `end_period?` (nulo enquanto ativa).
- Gera, ao abrir cada competência, o lançamento pendente que ainda falta ali (ex.: energia, internet, fatura do cartão).
- `interval_months`: 1 (todo mês) ou 12 (todo ano: IPVA, IPTU, anuidade); uma anual só gera o mês do início e os mesmos meses dos anos seguintes. Não muda depois de criada.
- Uma `RecurrenceOccurrence` (`recurrence_id`, `period`, `transaction_id?`) marca cada mês gerado. Excluir o lançamento gerado não faz o mês ser gerado de novo.
- Mudar ou encerrar só altera os lançamentos pendentes do mês atual em diante.
- `variable_amount`: o valor varia (energia, água); cada mês nasce com a média dos 3 últimos efetivados e fica marcado como estimado (`transactions.amount_estimated`) até o valor real ser informado ou o lançamento ser efetivado.

### BudgetConfig (Configuração de orçamento)

- `workspace_id`, `period`, `net_income_cents`; uma fatia (`BudgetShare`) por destino (`BudgetDestination`: Despesas, fixo, e as metas de guardar, cada uma com a sua categoria de saída), em pontos-base ([ADR 0010](../adr/0010-dinheiro-e-datas.md), [ADR 0047](../adr/0047-orcamento-real-por-destino.md)).
- **Toda fatia é um % da renda líquida** ([ADR 0064](../adr/0064-metas-como-parte-da-renda.md)): o limite de gastos e as metas somam até 10000; o que falta é "Sem meta". O valor de cada meta é `renda × %`, fixo no mês. A sobra (entradas − gastos) é só um fato do mês.
- Uma competência sem configuração salva herda a última salva antes dela; sem nenhuma, o orçamento vem vazio ([ADR 0030](../adr/0030-orcamento-por-competencia-com-heranca.md), ADR 0047).

### PeriodClosing (Fechamento do mês) — fase 5 ([ADR 0063](../adr/0063-fechamento-do-mes.md))

- `workspace_id`, `period`, `closed_at`, `closed_by`, `reopened_at?`, `reopened_by?`, `reopen_reason?`
- No máximo um fechamento em vigor (`reopened_at` nulo) por espaço e competência; reabrir preenche `reopened_*`, e fechar de novo cria outra linha, que fica como histórico.
- Regras:
  - fecha só sem lançamentos pendentes no mês, fora o a receber ou a pagar sem vencimento numa categoria "Nem renda nem gasto", que num mês fechado só aceita o recebimento ou pagamento parcial;
  - ao fechar, o orçamento herdado é salvo no próprio mês;
  - num mês fechado, nada que escreva nele passa (409 `PERIOD_CLOSED`), conferido pelo serviço e por um trigger no banco; as recorrências não geram meses nele;
  - EDITOR fecha e reabre; reabrir exige um motivo.

### Pessoa e rateio (fase 5)

Pessoa (`Person`): um contato do espaço, só o nome, para quem usa ou não o app, opcionalmente ligado a um membro. Um lançamento pode ser ligado a uma pessoa (crédito = a receber de, débito = a pagar para), e dividir um gasto cria um crédito pendente "a receber" por pessoa, na categoria Reembolso ([ADR 0042](../adr/0042-pessoas-e-rateio.md)); dividir uma entrada cria um débito pendente "a pagar" por pessoa, na categoria Repasse ([ADR 0052](../adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md)).

Acerto (`PersonSettlement`, [ADR 0065](../adr/0065-acerto-com-pessoa.md)): "Pagar a Ana" quita num só dia as saídas pendentes da pessoa e, se se quiser, as entradas dela (compensar). Guarda o dia, as compras, o compensado e a recompensa, uma entrada já recebida do que a pessoa devolveu. Os lançamentos quitados apontam para ele (`settlement_id`); desfazer volta a pendentes os que continuam quitados por ele e exclui a recompensa. Nenhuma saída de pagamento é criada: quitar as compras é o pagamento.

### Merchant (Estabelecimento) — fase 5 ([ADR 0053](../adr/0053-estabelecimentos.md))

Onde se comprou ou quem pagou: um cadastro do espaço, só o nome (único no espaço, ignorando maiúsculas e acentos), sem tipo e sem categoria fixa. Lançamentos, recorrências e parcelamentos têm um `merchant_id` opcional, herdado por cada mês gerado e cada parcela; as partes de uma divisão não o herdam. Pessoa responde "com quem", estabelecimento responde "onde", e um lançamento pode ter os dois. Arquiva-se em vez de excluir; só um arquivado sem uso é excluído (`MERCHANT_IN_USE`).

Apelidos (`MerchantAlias`, [ADR 0055](../adr/0055-importacao-da-fatura-do-cartao.md)): os textos como o estabelecimento aparece no extrato do cartão. Cada apelido é de um estabelecimento só e não se repete no espaço, comparado sem maiúsculas, acentos, espaços a mais e o " - Parcela n/N" do fim (`normalizeStatementTitle`). Um título do extrato é do estabelecimento cujo apelido o começa; o mais longo vence (`findMerchantByAlias`). Excluir o estabelecimento leva os apelidos.

### PaymentMethod (Meio de pagamento) — fase 5 ([ADR 0054](../adr/0054-meio-de-pagamento.md))

Como se pagou ou recebeu, numa lista fixa: Pix, Débito, Crédito, Vale-alimentação/refeição, Dinheiro, Boleto, Transferência e Débito automático. Lançamentos, recorrências e parcelamentos têm um `payment_method` opcional, herdado por cada mês gerado e cada parcela; as partes de uma divisão não o herdam. Na tela, "Meio de pagamento" numa saída e "Meio de recebimento" numa entrada. Não é uma conta com saldo; o cartão de Crédito e Débito é o cadastro abaixo.

### Card (Cartão) — fase 5 ([ADR 0062](../adr/0062-cartoes-e-pagar-fatura.md))

Um cartão do espaço: nome (único no espaço, ignorando maiúsculas e acentos), banco (opcional, da lista dos extratos) e funções, Crédito, Débito ou as duas. Só com Crédito ele tem o dia do fechamento e o dia do vencimento. Não tem limite nem saldo. Lançamentos, recorrências, parcelamentos e importações têm um `card_id`, aceito só com o meio Crédito ou Débito e de um cartão com essa função, e obrigatório com esses meios daqui em diante (os lançamentos de antes continuam válidos até serem editados); cada mês gerado e cada parcela o herdam, e as partes de uma divisão não. Arquiva-se em vez de excluir; só um arquivado sem uso é excluído.

A **fatura** é o cartão mais o vencimento: os lançamentos daquele cartão no Crédito que vencem naquele dia. "Pagar fatura" quita numa vez os pendentes dela, compras e estornos (que abatem do total), num só dia, e o "Desfazer" volta a pendentes só o que aquele pagamento quitou.

## Indicadores do painel (por espaço e competência)

Calculados na API a partir dos lançamentos, nunca armazenados, nas visões prevista (tudo) e efetivada (só o recebido e o pago), pela função `summarizePeriod` do `packages/shared` ([ADR 0031](../adr/0031-painel-do-mes-previsto-e-efetivado.md)). Fórmulas de referência em [planilha-origem.md](planilha-origem.md#indicadores-fórmulas).

## Categorias padrão

Copiadas para cada novo espaço; o usuário pode editar, arquivar e criar outras. A lista é genérica de propósito: cada pessoa cria as categorias da sua vida.

**Créditos:** Salário, Bônus, Renda extra, Rendimentos, Reembolso, Outros

**Débitos:** Moradia, Contas da casa, Mercado, Restaurantes, Transporte, Saúde, Cuidados pessoais, Educação, Lazer, Compras, Presentes e doações, Pets, Assinaturas, Impostos e taxas, Repasse, Outros

- **"Reembolso"** recebe as partes de uma saída dividida ([ADR 0042](../adr/0042-pessoas-e-rateio.md)), e **"Repasse"** as de uma entrada dividida ([ADR 0052](../adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md)). As duas são fixas: marcadas no banco (`split_role`), não se renomeiam, arquivam nem excluem (nota no ADR 0052).
- **Os destinos de guardar padrão** são Reserva de emergência e Investimentos, e cada um cria a sua categoria de débito com o mesmo nome ([ADR 0047](../adr/0047-orcamento-real-por-destino.md)).
- **"Nem renda nem gasto"** é uma marca que a pessoa põe numa categoria sua, como "Empréstimo pessoal": os lançamentos dela contam no saldo (e as saídas diminuem a sobra para guardar), mas não como renda (entradas do mês) nem como gasto (limite de gastos e Análise) ([ADR 0056](../adr/0056-categoria-nem-renda-nem-gasto.md)). Nenhuma categoria padrão vem marcada.
- **O que está a receber sem vencimento** (uma entrada pendente, sem vencimento, numa categoria "Nem renda nem gasto", como um empréstimo sem prazo para voltar) fica nas Entradas e em Pessoas, mas fora do Saldo previsto. Quando o dinheiro volta aos poucos, o "Recebimento parcial" lança o valor recebido no mês da data e diminui o pendente ([ADR 0057](../adr/0057-receber-parte-e-a-receber-sem-data.md)). O mesmo vale para uma dívida sem vencimento, uma saída pendente numa categoria de saída marcada: fica fora do Saldo previsto e da sobra prevista, e cada pagamento conta no mês em que é feito (nota no ADR 0057).
- **Emprestado para:** uma categoria de saída "Nem renda nem gasto" pode dizer em que categoria de entrada marcada entra a devolução ("Categoria da devolução", em Categorias). Aí, dividir uma saída dela é emprestar: a parte de cada pessoa vai para essa categoria, e não para Reembolso, e as partes já lançadas acompanham a escolha ([ADR 0058](../adr/0058-emprestado-para.md)).
- **Peguei emprestado de:** o espelho, para o empréstimo que você toma. Uma categoria de entrada "Nem renda nem gasto" escolhe a categoria de saída marcada da dívida ("Categoria da dívida"). Aí, dividir uma entrada dela é pegar emprestado: o valor a pagar a cada pessoa vai para essa categoria, e não para Repasse ([ADR 0059](../adr/0059-peguei-emprestado-de.md)).

**Histórico:** até a versão 1.0.0, a lista vinha da planilha pessoal de origem, com 14 categorias de crédito e 26 de débito, como PLR, Lote, Inglês e IPVA. Ela foi trocada pela atual antes da 1.0.0 (nota de 2026-10-10 no [ADR 0024](../adr/0024-espacos-membros-e-espaco-pessoal.md)). Os espaços criados antes continuam com as categorias que receberam. "Viagem" saiu junto com o destino padrão "Viagens".

> Observação: "Cartão de crédito" deixou de ser categoria padrão: como se pagou é o meio de pagamento ([ADR 0054](../adr/0054-meio-de-pagamento.md)), e a compra fica na categoria do que se comprou. Os espaços criados antes continuam com a categoria; arquivá-la a tira dos seletores. Tratar o cartão como conta com fatura continua sendo uma evolução possível (novo ADR).
