# 0047 — Orçamento real por destino: duas bases, destinos personalizados e aplicações

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

Hoje o orçamento de uma competência ([ADR 0030](0030-orcamento-por-competencia-com-heranca.md)) tem a renda líquida, a renda bruta e quatro percentuais fixos: despesas, investimentos, reserva de emergência e viagens. O Painel ([ADR 0031](0031-painel-do-mes-previsto-e-efetivado.md)) mostra, por destino, "Meta", "Previsto" e "Efetivado". Os três **são o percentual aplicado a um total, e não dinheiro movido**:

| Coluna    | Como é calculada hoje         |
| --------- | ----------------------------- |
| Meta      | % da renda líquida digitada   |
| Previsto  | % de todos os créditos do mês |
| Efetivado | % dos créditos já recebidos   |

Por exemplo: com R$ 5.000 recebidos, o Painel diz "Investimentos efetivado: R$ 1.000" mesmo sem nada investido. O "Resultado" também desconta essas metas calculadas, e não o que foi guardado.

**Como o dono usava a planilha:**

- **O salário líquido** servia para ter noção de **quanto dá para gastar** no mês. Só ele, porque é o garantido.
- **O que sobra no mês** (créditos menos despesas) é o que se divide entre **investimentos, reserva e viagens**.
- **Cada mês tem necessidades próprias:** um mês pode ter um destino "Reforma" ou "Presente de Natal".

## Opções consideradas

**Como saber quanto foi para cada destino**

1. **Ligar cada categoria de débito a um destino:** configurar categoria por categoria.
2. **Marcar o destino em cada lançamento:** um campo a mais a cada lançamento, fácil de esquecer.
3. **Cada destino de "guardar" tem a sua própria categoria de débito.** Um lançamento nela é uma **aplicação**, e todo o resto é despesa.

**Os destinos**

1. **Manter os quatro fixos.**
2. **Um cadastro de destinos por espaço,** como o de categorias.

## Decisão

**Opção 3 para as aplicações, opção 2 para os destinos.**

### Duas bases

| Destino                                                                | Base da meta                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Despesas** (fixo, um por espaço)                                     | **Renda líquida** informada no orçamento: o limite do que dá para gastar |
| **Destinos de guardar** (Investimentos, Reserva, Viagens e os criados) | **Disponível para guardar** = créditos − despesas                        |

**Os percentuais:**

- **Despesas:** até 100% da renda líquida.
- **Destinos de guardar:** a soma vai até 100% do disponível. O que não tem destino continua livre.

**O que é despesa e o que é aplicação:**

- **Despesas** = débitos fora das categorias de destino.
- **Aplicações** = débitos nas categorias de destino.

As aplicações **não entram na base**. É isso que tira a circularidade: aplicar não diminui a própria meta.

**Disponível negativo:** quando as despesas passam dos créditos, as metas de guardar ficam em zero, e o Painel diz quanto faltou.

### Destinos e as suas categorias

- **Tabela `budget_destinations`** (com RLS, [ADR 0028](0028-row-level-security.md)): nome, tipo (`EXPENSES` ou `SAVINGS`), ordem, arquivamento e a categoria de débito do destino.
- **"Despesas"** é o único `EXPENSES`. É criado com o espaço, não tem categoria própria e não pode ser excluído nem arquivado.
- **Ao criar um destino de guardar,** a categoria de débito de mesmo nome é criada **na mesma transação**:
  - renomear o destino renomeia a categoria;
  - arquivar arquiva os dois;
  - excluir só é possível sem lançamentos na categoria. Se houver, a API responde `DESTINATION_IN_USE`, como em pessoas ([ADR 0042](0042-pessoas-e-rateio.md)).
- **Na tela de Categorias,** a categoria de um destino aparece marcada ("Destino do orçamento") e só é gerida pelo destino.
- **Espaços novos** ganham Despesas, Investimentos, Reserva de emergência e Viagens, junto com as categorias padrão.
- **A categoria padrão "Viagem"** continua sendo despesa: são os **gastos** de uma viagem. O destino "Viagens" é o dinheiro **guardado** para ela.

### Percentuais por competência

- **`budget_configs`** fica com a competência e a renda líquida. A renda bruta e as quatro colunas de percentual saem.
- **Tabela nova `budget_shares`** (com RLS): competência, destino e pontos-base.
- **A herança do [ADR 0030](0030-orcamento-por-competencia-com-heranca.md) continua:** uma competência sem orçamento salvo usa a última anterior salva.
- **O padrão 60/20/15/5 acaba.** Enquanto o espaço não tiver nenhum orçamento salvo, o orçamento vem **vazio** (`source: NONE`). O Painel mostra "Definir orçamento" destacado.
- **Destinos criados depois** entram com 0% nas competências antigas.

### O resumo do mês

**`summarizePeriod`, por destino:**

| Campo       | Despesas           | Destinos de guardar                                    |
| ----------- | ------------------ | ------------------------------------------------------ |
| Meta        | % da renda líquida | % do disponível (previsto)                             |
| Aplicado    | despesas pagas     | aplicações pagas                                       |
| A aplicar   | despesas a pagar   | aplicações a pagar (recorrências e parcelas incluídas) |
| % realizado | aplicado ÷ meta    | aplicado ÷ meta                                        |

**Os saldos:**

- **O saldo do mês não muda:** créditos − débitos, o dinheiro realmente livre.
- **O "Resultado" sai.** Em seu lugar entram "Disponível para guardar" e "Aplicado".

### As telas (PR 3)

**No Painel, "Orçamento por destino":**

- uma linha por destino: %, meta, aplicado e % realizado;
- o medidor de despesas continua;
- em cada destino de guardar, **"Registrar aplicação"** abre o formulário de lançamento com a categoria do destino e o valor que falta para a meta já preenchidos.

**No modal do orçamento ([ADR 0046](0046-orcamento-no-painel.md)):**

- a renda líquida e o % de Despesas;
- a lista dos destinos de guardar, com o % de cada;
- "Novo destino", e renomear e arquivar no menu de cada um.

**Quem só lê** vê os números, sem botões.

### A migração dos dados existentes

**Para cada espaço:**

- os quatro destinos são criados, cada um de guardar com a sua categoria;
- cada `budget_config` salvo vira as suas linhas em `budget_shares`, com os **mesmos números**;
- a renda bruta é descartada.

**O significado de três percentuais muda:** Investimentos, Reserva e Viagens passam de % da renda para % do disponível. O dono revisa os valores no modal depois do deploy.

## Consequências

- **O Painel mostra dinheiro de verdade:** quanto foi gasto, quanto foi guardado em cada destino e quanto falta para cada meta.
- **Investir todo mês** vira uma recorrência na categoria do destino, como qualquer conta fixa ([ADR 0038](0038-recorrencias-e-parcelamentos.md)).
- **Exportação:** as duas tabelas novas entram em `EXPORTED_TABLES` ([ADR 0041](0041-termos-exportacao-e-exclusao-de-conta.md)).
- **Importação ([ADR 0040](0040-importacao-da-planilha.md)):** a planilha modelo continua igual; uma linha na categoria de um destino é uma aplicação.
- **O ADR 0031 muda** onde fala de meta, previsto, efetivado e resultado. O ADR 0030 muda na tabela e no padrão; a herança fica.
- **Implementação em três PRs.** O web valida as respostas da API com os schemas compartilhados, então mudar o contrato do orçamento ou do resumo exige mudar a API e o web juntos:
  1. **só acréscimos:** destinos, as suas categorias e a migração dos espaços existentes, sem mudar o orçamento nem o Painel;
  2. **percentuais e resumo:** os percentuais por competência, copiados dos orçamentos atuais, e o resumo com aplicações e as duas bases, com a API e o web adaptados juntos;
  3. **as telas novas.**
