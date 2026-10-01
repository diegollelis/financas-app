# 0008 — Multi-tenancy por Espaço (workspace)

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto
A aplicação é multiusuário e pública. Na planilha original já existem finanças compartilhadas (despesas divididas com outra pessoa). Um usuário nunca pode ver dados de outro, a menos que os dois participem do mesmo espaço.

## Opções consideradas
1. **Dados pertencem ao usuário (`user_id`)** — simples, mas não permite finanças compartilhadas.
2. **Um schema ou banco por espaço** — isolamento forte, porém migrações e custo inviáveis no plano gratuito.
3. **Banco único, dados pertencem ao Espaço (`workspace_id`)** — flexível e barato; o isolamento depende de disciplina e de testes.

## Decisão
Banco único com dados pertencentes ao **Espaço**:

```
User ──< Member (role: OWNER | EDITOR | VIEWER) >── Workspace
Workspace ──< Category, Transaction, InstallmentPlan, Recurrence, BudgetConfig
```

- Ao se cadastrar, o usuário ganha um **espaço pessoal**; pode criar outros e convidar membros.
- Toda tabela de negócio tem `workspace_id` (NOT NULL, indexado, FK).
- O espaço ativo vem da requisição (rota `/workspaces/:workspaceId/...`) e é validado por um **guard** que confere se o usuário é membro e se o papel permite a operação.
- Os repositórios **sempre** recebem o `workspaceId` e filtram por ele — nunca há consulta de negócio sem esse filtro.
- **Row Level Security** do PostgreSQL como segunda barreira (implementação na fase 2, como estudo).

## Consequências
- Equivalente ao `xFilial()` do Protheus: o filtro é obrigatório em toda consulta.
- **Testes de isolamento são obrigatórios**: para cada recurso, um teste prova que um usuário de outro espaço recebe 404 (não 403, para não revelar que o registro existe).
- Ao criar um espaço, as categorias padrão são copiadas para ele ([modelo](../dominio/modelo.md)).
