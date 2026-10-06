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
- Gera um `Transaction` por parcela; a diferença de arredondamento vai para a última parcela.

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

### Rateio (fase 5, a definir)

Lançamento dividido com outra pessoa (membro do espaço ou contato externo). Modelagem a decidir em ADR próprio.

## Indicadores do painel (por espaço e competência)

Calculados na API a partir dos lançamentos, nunca armazenados, nas visões prevista (tudo) e efetivada (só o recebido e o pago), pela função `summarizePeriod` do `packages/shared` ([ADR 0031](../adr/0031-painel-do-mes-previsto-e-efetivado.md)). Fórmulas de referência em [planilha-origem.md](planilha-origem.md#indicadores-fórmulas).

## Categorias padrão

Copiadas para cada novo espaço; o usuário pode editar, arquivar e criar outras.

**Créditos:** Salário · PLR · 13º salário · Férias · Benefício · Cashback · Freelance · Vendas · Empréstimo · Consórcio · Saque-aniversário FGTS · Restituição IRPF · Outros

**Débitos:** Cartão de crédito · Energia · Internet · Celular · Streaming · Mercado · Vale-alimentação · Combustível · Carro · Seguro do carro · IPVA · Lote · Consórcio · Empréstimo · Faculdade · Pós-graduação · Curso · Inglês · Concurso · Saúde · Farmácia · Suplemento · Roupas · Lazer · Viagem · Outros

Correções em relação à planilha: removidos "Energia" (estava em créditos) e "Salário + PLR" (usar dois lançamentos); "FreeLancer" → "Freelance"; "IRPF" → "Restituição IRPF".

> Observação: "Cartão de crédito" como categoria esconde o que foi comprado. Uma evolução futura é tratar o cartão como **conta/fatura** com itens categorizados (novo ADR).
