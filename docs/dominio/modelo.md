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
- `amount_cents` (> 0), `period` (competência `YYYY-MM`), `due_date` (opcional), `settled_at`
- `installment_plan_id?`, `installment_number?`, `recurrence_id?`
- Regras:
  - a categoria pertence ao mesmo espaço e tem o mesmo `type` (garantido pelo banco, [ADR 0029](../adr/0029-lancamentos-e-integridade-no-banco.md)); categoria arquivada não pode ser escolhida;
  - status: **pendente** (`settled_at` nulo), **vencido** (pendente e `due_date` < hoje), **efetivado** (`settled_at` preenchido).

### InstallmentPlan (Parcelamento) — fase 5

- `workspace_id`, `description`, `total_cents`, `installments`, `first_period`
- Gera, ao ser criado, um `Transaction` por parcela (`installment_plan_id`, `installment_number`), uma por competência; o total pode ser digitado como total ou como valor da parcela, e a diferença de arredondamento vai para a última parcela ([ADR 0038](../adr/0038-recorrencias-e-parcelamentos.md)).
- Encerrar remove as parcelas pendentes do mês atual em diante; as pagas ficam.

### Recurrence (Recorrência) — fase 5 ([ADR 0038](../adr/0038-recorrencias-e-parcelamentos.md))

- `workspace_id`, `type`, `description`, `notes?`, `category_id`, `amount_cents` (valor estimado), `due_day?` (1 a 31; o dia que o mês não tem vira o último), `start_period`, `end_period?` (nulo enquanto ativa).
- Gera, ao abrir cada competência, o lançamento pendente que ainda falta ali (ex.: energia, internet, fatura do cartão).
- Uma `RecurrenceOccurrence` (`recurrence_id`, `period`, `transaction_id?`) marca cada mês gerado. Excluir o lançamento gerado não faz o mês ser gerado de novo.
- Mudar ou encerrar só altera os lançamentos pendentes do mês atual em diante.
- `variable_amount`: o valor varia (energia, água); cada mês nasce com a média dos 3 últimos efetivados e fica marcado como estimado (`transactions.amount_estimated`) até o valor real ser informado ou o lançamento ser efetivado.

### BudgetConfig (Configuração de orçamento)

- `workspace_id`, `period`, `net_income_cents`, `gross_income_cents?`
- Percentuais em pontos-base ([ADR 0010](../adr/0010-dinheiro-e-datas.md)): despesas, investimentos, reserva de emergência, viagens — soma ≤ 10000.
- Uma competência sem configuração salva herda a última salva antes dela; sem nenhuma, valem 60/20/15/5 e renda 0 ([ADR 0030](../adr/0030-orcamento-por-competencia-com-heranca.md)).
- Evolução possível: destinos de orçamento configuráveis (lista em vez de quatro campos fixos).

### Pessoa e rateio (fase 5)

Pessoa (`Person`): um contato do espaço, só o nome, para quem usa ou não o app, opcionalmente ligado a um membro. Um lançamento pode ser ligado a uma pessoa (crédito = a receber de, débito = a pagar para), e dividir um gasto cria um crédito pendente "a receber" por pessoa, na categoria Reembolso ([ADR 0042](../adr/0042-pessoas-e-rateio.md)); dividir uma entrada cria um débito pendente "a pagar" por pessoa, na categoria Repasse ([ADR 0052](../adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md)).

### Merchant (Estabelecimento) — fase 5 ([ADR 0053](../adr/0053-estabelecimentos.md))

Onde se comprou ou quem pagou: um cadastro do espaço, só o nome (único no espaço, ignorando maiúsculas e acentos), sem tipo e sem categoria fixa. Lançamentos, recorrências e parcelamentos têm um `merchant_id` opcional, herdado por cada mês gerado e cada parcela; as partes de uma divisão não o herdam. Pessoa responde "com quem", estabelecimento responde "onde", e um lançamento pode ter os dois. Arquiva-se em vez de excluir; só um arquivado sem uso é excluído (`MERCHANT_IN_USE`).

## Indicadores do painel (por espaço e competência)

Calculados na API a partir dos lançamentos, nunca armazenados, nas visões prevista (tudo) e efetivada (só o recebido e o pago), pela função `summarizePeriod` do `packages/shared` ([ADR 0031](../adr/0031-painel-do-mes-previsto-e-efetivado.md)). Fórmulas de referência em [planilha-origem.md](planilha-origem.md#indicadores-fórmulas).

## Categorias padrão

Copiadas para cada novo espaço; o usuário pode editar, arquivar e criar outras. A lista é genérica de propósito: cada pessoa cria as categorias da sua vida.

**Créditos:** Salário, Renda extra, Rendimentos, Reembolso, Outros

**Débitos:** Moradia, Contas da casa, Mercado, Restaurantes, Transporte, Saúde, Educação, Lazer, Compras, Assinaturas, Cartão de crédito, Impostos e taxas, Repasse, Outros

- **"Reembolso"** recebe as partes de uma saída dividida ([ADR 0042](../adr/0042-pessoas-e-rateio.md)), e **"Repasse"** as de uma entrada dividida ([ADR 0052](../adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md)).
- **Os destinos de guardar padrão** são Reserva de emergência e Investimentos, e cada um cria a sua categoria de débito com o mesmo nome ([ADR 0047](../adr/0047-orcamento-real-por-destino.md)).

**Histórico:** até a versão 1.0.0, a lista vinha da planilha pessoal de origem, com 14 categorias de crédito e 26 de débito, como PLR, Lote, Inglês e IPVA. Ela foi trocada pela atual antes da 1.0.0 (nota de 2026-10-10 no [ADR 0024](../adr/0024-espacos-membros-e-espaco-pessoal.md)). Os espaços criados antes continuam com as categorias que receberam. "Viagem" saiu junto com o destino padrão "Viagens".

> Observação: "Cartão de crédito" como categoria esconde o que foi comprado. Uma evolução futura é tratar o cartão como **conta/fatura** com itens categorizados (novo ADR).
