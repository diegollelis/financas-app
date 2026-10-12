# Glossário

## Termos da interface (pt-BR ↔ código)

O nome que a pessoa vê na tela e o nome no código são independentes ([ADR 0051](../adr/0051-vocabulario-da-interface.md)). Esta tabela é a ponte entre os dois. Um termo novo da interface entra aqui primeiro, e um conceito tem um nome só em todas as telas, nos toasts e nos e-mails.

### Espaços e acesso

| Interface                          | Código                        | Definição                                                                   |
| ---------------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| Espaço                             | `Workspace`                   | Conjunto de dados financeiros, de uma pessoa ou compartilhado               |
| Pessoal                            | `isPersonal`                  | O espaço de cada um, criado no cadastro; nunca é compartilhado nem excluído |
| Membro                             | `Member`                      | Vínculo de uma conta com um espaço, com um acesso                           |
| Dono / Pode editar / Só visualizar | `OWNER` / `EDITOR` / `VIEWER` | O acesso do membro (`roleLabels` em `packages/shared`)                      |
| Convite                            | `Invitation`                  | Link enviado por e-mail para entrar num espaço                              |

### Lançamentos

| Interface                              | Código                            | Definição                                                                           |
| -------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| Lançamento                             | `Transaction`                     | Uma entrada ou uma saída de dinheiro                                                |
| Entrada / Saída                        | `CREDIT` / `DEBIT`                | O tipo do lançamento                                                                |
| Categoria                              | `Category`                        | Classificação do lançamento, de um tipo só                                          |
| Mês (na importação, Mês de referência) | `period` (`YYYY-MM`)              | O mês ao qual o lançamento pertence (nos docs técnicos, "competência")              |
| Vencimento                             | `dueDate`                         | Data prevista para pagar ou receber                                                 |
| Pago em / Recebido em                  | `settledAt`                       | Data em que a saída foi paga ou a entrada foi recebida                              |
| Marcar como pago / recebido            | `PATCH { settledAt }`             | A ação de registrar o pagamento ou o recebimento                                    |
| Pendente / Vencido / Pago, Recebido    | `PENDING` / `OVERDUE` / `SETTLED` | Situação derivada (`transactionStatus`, [modelo](modelo.md#transaction-lançamento)) |
| Recorrência                            | `Recurrence`                      | Lançamento que se repete todo mês                                                   |
| Valor estimado                         | `amountEstimated`                 | Valor de uma recorrência variável ainda não confirmado                              |
| Parcelamento / Parcela                 | `InstallmentPlan` / `installment` | Compra ou dívida dividida em parcelas, uma por mês                                  |
| Pessoa                                 | `Person`                          | Contato do espaço a quem se deve ou que deve                                        |
| Membro / Você (selos de Pessoa)        | `isMember`, `memberUserId`        | A pessoa de um membro do espaço compartilhado, criada sozinha; "Você" é a sua       |
| A receber de / A pagar para            | `personId`                        | A pessoa ligada a uma entrada ou a uma saída                                        |
| Dividir com alguém                     | `split`, `splitOfId`              | Dividir uma saída cria uma entrada pendente por pessoa                              |
| Reembolso                              | `REIMBURSEMENT_CATEGORY_NAME`     | A categoria de entrada das partes de uma divisão                                    |
| Importação                             | `TransactionImport`               | Lançamentos trazidos de uma planilha, desfazível                                    |

### Orçamento e Painel

| Interface                                                   | Código                                           | Definição                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Orçamento do mês                                            | `BudgetConfig` + `BudgetShare`                   | A renda líquida e os percentuais salvos para um mês, herdados pelos seguintes                          |
| Renda líquida                                               | `netIncomeCents`                                 | A base do limite de gastos                                                                             |
| Limite de gastos                                            | destino `EXPENSES`                               | O % da renda líquida que se planeja gastar                                                             |
| Despesas                                                    | `expenses`                                       | Saídas fora das categorias das metas de guardar                                                        |
| Disponível para guardar                                     | `available`                                      | Entradas − despesas: a base das metas de guardar                                                       |
| Meta                                                        | `BudgetDestination` `SAVINGS`                    | Um % do disponível, com a sua categoria de saída (Reserva de emergência…)                              |
| Guardar / Guardado (formulário: "Registrar valor guardado") | saída na categoria da meta, `appliedCents`       | Registrar dinheiro guardado numa meta (descrição preenchida "Aporte em {meta}") / o total já pago nela |
| Pendente (na meta)                                          | `pendingCents`                                   | Saídas da meta ainda não pagas                                                                         |
| Progresso                                                   | `appliedCents ÷ targetCents`                     | Quanto da meta já foi guardado, em %                                                                   |
| Para guardar                                                | `applied.plannedCents` (Análise, visão prevista) | O que vai para as metas, pago ou não                                                                   |
| Sem meta                                                    | `unallocated`                                    | A parte do disponível previsto que nenhuma meta recebeu; uma divisão do orçamento, não um saldo        |
| Previsto / Realizado                                        | visões `planned` / `settled`                     | Tudo o que foi lançado / só o que já foi pago ou recebido                                              |
| Saldo previsto                                              | `balance.plannedCents`                           | Como o mês termina se tudo for pago e recebido                                                         |
| Saldo atual                                                 | `balance.settledCents`                           | Recebido − pago até agora                                                                              |

## Pontes com o Protheus

| Protheus                        | Neste projeto                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Dicionário SX2/SX3, UPDDISTR    | `schema.prisma` e migrações Prisma                                                     |
| `X3_CAMPO` × `X3_TITULO`        | Nome no código × termo da interface (as tabelas acima)                                 |
| `xFilial()` / campo `_FILIAL`   | `workspace_id` + guard de espaço ([ADR 0008](../adr/0008-multi-tenancy-por-espaco.md)) |
| Rotina MVC (ModelDef / ViewDef) | Módulo NestJS (controller, service, repository) + telas React                          |
| X3_VALID, X3_OBRIGAT            | Schemas Zod em `packages/shared`                                                       |
| Serviços REST (WSRESTFUL)       | Controllers REST do NestJS                                                             |
| Pontos de entrada               | Eventos/hooks da aplicação                                                             |
| Consulta padrão (SXB)           | Endpoints de listagem/busca + componentes de seleção                                   |
| Job / schedule                  | GitHub Actions agendado ou cron do provedor                                            |
