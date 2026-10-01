# Planilha de origem

A aplicação nasce de uma planilha Excel pessoal (`Financas-app.xlsx`). A planilha **não** é versionada, porque contém dados bancários. Este documento registra a estrutura e as regras dela, que servem de especificação inicial.

## Estrutura

- **Uma aba por mês**, nomeada `AAAA-MÊS` (ex.: `2026-SETEMBRO`). Na aplicação, isso vira o campo **competência** (`period`) do lançamento.
- **Aba `Categorias`**: duas listas, Créditos e Débitos, usadas como listas suspensas nas abas mensais.

### Aba mensal

| Área | Conteúdo |
|---|---|
| `B22:G42` | **Créditos**: Descrição, Categoria, Valor, Valor Recebido, Data, OK |
| `J22:O42` | **Débitos**: Descrição, Categoria, Valor, Valor Pago, Data, OK |
| `Q2:R7` | Resumo do mês |
| `Q9:R10` | Salário bruto e salário líquido aproximado (digitados) |
| `Q11:R31` | Orçamento por percentual e resultado |

Um lançamento é dado como efetivado quando a coluna OK recebe `X`: `Valor Recebido = SE(OK="X"; Valor; 0)`.

## Indicadores (fórmulas)

| Indicador | Fórmula na planilha | Significado |
|---|---|---|
| Créditos pendentes | Σ Valor − Σ Recebido | Créditos ainda não recebidos |
| Créditos recebidos | Σ Recebido | |
| Débitos pendentes | Σ Valor − Σ Pago | Débitos ainda não pagos |
| Débitos pagos | Σ Pago | |
| Saldo final simulado | (créditos pendentes + recebidos) − (débitos pendentes + pagos) | Saldo se tudo for efetivado |
| Saldo final | créditos recebidos − débitos pagos | Saldo real até agora |
| Despesas | débitos pendentes + pagos | Total de débitos do mês |

### Orçamento por percentual

Cada destino tem um percentual configurável e dois valores calculados:
- **Simulado** = salário líquido × percentual
- **Real** = total de créditos do mês × percentual

| Destino | % padrão | Observação |
|---|---|---|
| Despesas | 60% | Comparado com as despesas reais: `Simulado − Despesas` (positivo = dentro da meta) |
| Investimentos | 20% | |
| Reserva de emergência | 15% | |
| Viagens | 5% | |

**Resultado** = total de créditos − despesas − investimentos (real) − reserva (real) − viagens (real). Indica quanto sobra (ou falta) depois de pagar as despesas e separar as metas.

### Formatação condicional → status na aplicação

- Categoria do débito em **vermelho** quando há valor e não está marcado como pago → status *pendente* (ou *vencido*, com a nova data de vencimento).
- Em **verde** quando pago → status *efetivado*.
- Saldos e resultado coloridos por sinal (positivo/negativo).

### Gráfico

Pizza com "Débitos pagos" × "Saldo final".

## Problemas identificados (a aplicação deve corrigir)

1. **"Valor Pendente" guarda o valor total**, não o pendente → um campo `amount` + status ([ADR 0010](../adr/0010-dinheiro-e-datas.md)).
2. **Uma única "Data"** sem distinguir vencimento de pagamento → `due_date` e `settled_at`.
3. **Limite fixo de 20 linhas** por tipo, com somatórios em intervalos fixos → sem limite.
4. **Validação de categorias inconsistente**: parte das linhas aponta para um intervalo que exclui a última categoria → categorias vêm do banco, por espaço.
5. **Categorias problemáticas**: "Energia" na lista de créditos, "Salário + PLR" (duas categorias em uma), quebra de linha em "Saque Aniversário" → corrigidas nas [categorias padrão](modelo.md#categorias-padrão).
6. **Parcelamentos e rateios só no texto** ("Parcela 04 de 08", "valor dividido com…") → entidades `InstallmentPlan` e divisão de valor.
7. **Lançamento efetivado com valor zero** cuja descrição cita outro valor → validação `amount > 0`; a importação deve sinalizar esses casos.
8. **Valores "Real" usam créditos ainda não recebidos** → decidir na fase 3 se o painel mostra as duas visões (previsto e efetivado).
9. **Percentuais sem validação** → a soma deve ser ≤ 100%.
10. **Salário líquido digitado à parte** e divergente dos créditos lançados → configuração de orçamento por competência, com sugestão a partir dos créditos.
11. **Valores em ponto flutuante** e **datas em formato americano** → centavos inteiros e formato pt-BR.
12. **Dados sensíveis nas descrições** (conta bancária, chave Pix, nomes de terceiros) → cuidados de [ADR 0012](../adr/0012-privacidade-lgpd.md).
