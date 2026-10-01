# Glossário

## Termos de negócio (pt-BR ↔ código)

| Português (UI e docs)          | Código             | Definição                                                           |
| ------------------------------ | ------------------ | ------------------------------------------------------------------- |
| Espaço                         | `Workspace`        | Conjunto de dados financeiros compartilhado por um ou mais usuários |
| Membro                         | `Member`           | Vínculo de um usuário com um espaço, com um papel                   |
| Papel                          | `role`             | `OWNER` (dono), `EDITOR`, `VIEWER` (leitor)                         |
| Lançamento                     | `Transaction`      | Um crédito ou débito                                                |
| Crédito / Débito               | `CREDIT` / `DEBIT` | Entrada / saída de dinheiro                                         |
| Categoria                      | `Category`         | Classificação do lançamento, por tipo                               |
| Competência                    | `period`           | Ano-mês ao qual o lançamento pertence (`YYYY-MM`)                   |
| Vencimento                     | `due_date`         | Data prevista de pagamento/recebimento                              |
| Efetivação                     | `settled_at`       | Data em que foi pago/recebido                                       |
| Pendente / Efetivado / Vencido | status derivado    | Ver [modelo](modelo.md#transaction-lançamento)                      |
| Parcelamento                   | `InstallmentPlan`  | Compra ou dívida dividida em parcelas                               |
| Recorrência                    | `Recurrence`       | Lançamento que se repete todo mês                                   |
| Configuração de orçamento      | `BudgetConfig`     | Renda e percentuais de destino por competência                      |
| Saldo simulado                 | `projectedBalance` | Saldo se todos os lançamentos forem efetivados                      |
| Saldo real                     | `actualBalance`    | Créditos recebidos − débitos pagos                                  |

## Pontes com o Protheus

| Protheus                        | Neste projeto                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Dicionário SX2/SX3, UPDDISTR    | `schema.prisma` e migrações Prisma                                                     |
| `xFilial()` / campo `_FILIAL`   | `workspace_id` + guard de espaço ([ADR 0008](../adr/0008-multi-tenancy-por-espaco.md)) |
| Rotina MVC (ModelDef / ViewDef) | Módulo NestJS (controller, service, repository) + telas React                          |
| X3_VALID, X3_OBRIGAT            | Schemas Zod em `packages/shared`                                                       |
| Serviços REST (WSRESTFUL)       | Controllers REST do NestJS                                                             |
| Pontos de entrada               | Eventos/hooks da aplicação                                                             |
| Consulta padrão (SXB)           | Endpoints de listagem/busca + componentes de seleção                                   |
| Job / schedule                  | GitHub Actions agendado ou cron do provedor                                            |
