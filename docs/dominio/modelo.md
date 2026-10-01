# Modelo de domínio

Modelo conceitual inicial. O schema definitivo nasce no Prisma, nas fases 2 e 3 do [roadmap](../roadmap.md). Nomes em inglês ([ADR 0011](../adr/0011-idioma-do-codigo.md)); veja o [glossário](glossario.md).

## Entidades

### User
Pessoa autenticada. Tabelas de usuário, sessão e conta OAuth são geridas pelo Better Auth ([ADR 0007](../adr/0007-autenticacao-better-auth.md)).

### Workspace (Espaço)
Dono de todos os dados financeiros ([ADR 0008](../adr/0008-multi-tenancy-por-espaco.md)).
- `id`, `name`, `created_at`
- Criado automaticamente (espaço pessoal) no primeiro login.

### Member (Membro)
- `workspace_id`, `user_id`, `role` (`OWNER` | `EDITOR` | `VIEWER`)
- Único por (`workspace_id`, `user_id`). Todo espaço tem ao menos um `OWNER`.

### Category (Categoria)
- `workspace_id`, `name`, `type` (`CREDIT` | `DEBIT`), `archived_at`
- Único por (`workspace_id`, `type`, `name`).
- Categorias em uso não são excluídas, só arquivadas.

### Transaction (Lançamento)
- `workspace_id`, `type` (`CREDIT` | `DEBIT`), `description`, `notes`, `category_id`
- `amount_cents` (> 0), `period` (competência `YYYY-MM`), `due_date`, `settled_at`
- `installment_plan_id?`, `installment_number?`, `recurrence_id?`
- Regras:
  - a categoria pertence ao mesmo espaço e tem o mesmo `type`;
  - status: **pendente** (`settled_at` nulo), **vencido** (pendente e `due_date` < hoje), **efetivado** (`settled_at` preenchido).

### InstallmentPlan (Parcelamento) — fase 5
- `workspace_id`, `description`, `total_cents`, `installments`, `first_period`
- Gera um `Transaction` por parcela; a diferença de arredondamento vai para a última parcela.

### Recurrence (Recorrência) — fase 5
- `workspace_id`, `description`, `category_id`, `type`, `estimated_amount_cents`, `due_day`, `active`
- Gera os lançamentos pendentes de cada competência (ex.: energia, internet, fatura do cartão).

### BudgetConfig (Configuração de orçamento)
- `workspace_id`, `period`, `net_income_cents`, `gross_income_cents?`
- Percentuais em pontos-base ([ADR 0010](../adr/0010-dinheiro-e-datas.md)): despesas, investimentos, reserva de emergência, viagens — soma ≤ 10000.
- Uma configuração nova copia a da competência anterior.
- Evolução possível: destinos de orçamento configuráveis (lista em vez de quatro campos fixos).

### Rateio (fase 5, a definir)
Lançamento dividido com outra pessoa (membro do espaço ou contato externo). Modelagem a decidir em ADR próprio.

## Indicadores do painel (por espaço e competência)

Calculados na API a partir dos lançamentos — nunca armazenados. Fórmulas de referência em [planilha-origem.md](planilha-origem.md#indicadores-fórmulas).

## Categorias padrão

Copiadas para cada novo espaço; o usuário pode editar, arquivar e criar outras.

**Créditos:** Salário · PLR · 13º salário · Férias · Benefício · Cashback · Freelance · Vendas · Empréstimo · Consórcio · Saque-aniversário FGTS · Restituição IRPF · Outros

**Débitos:** Cartão de crédito · Energia · Internet · Celular · Streaming · Mercado · Vale-alimentação · Combustível · Carro · Seguro do carro · IPVA · Lote · Consórcio · Empréstimo · Faculdade · Pós-graduação · Curso · Inglês · Concurso · Saúde · Farmácia · Suplemento · Roupas · Lazer · Viagem · Outros

Correções em relação à planilha: removidos "Energia" (estava em créditos) e "Salário + PLR" (usar dois lançamentos); "FreeLancer" → "Freelance"; "IRPF" → "Restituição IRPF".

> Observação: "Cartão de crédito" como categoria esconde o que foi comprado. Uma evolução futura é tratar o cartão como **conta/fatura** com itens categorizados (novo ADR).
