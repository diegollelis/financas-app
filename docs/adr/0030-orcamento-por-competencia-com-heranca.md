# 0030 — Orçamento por competência, herdado da última competência salva

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

Na planilha, cada aba mensal tem o salário líquido e o bruto digitados à parte, e os percentuais do orçamento: despesas 60%, investimentos 20%, reserva de emergência 15% e viagens 5%. Ao abrir um mês novo, copiava-se a aba anterior. O [modelo](../dominio/modelo.md#budgetconfig-configuração-de-orçamento) diz que "uma configuração nova copia a da competência anterior", mas não diz **quando** a cópia acontece.

Percentuais ficam em pontos-base inteiros ([ADR 0010](0010-dinheiro-e-datas.md)), e a soma não pode passar de 100% (problema 9 da [planilha](../dominio/planilha-origem.md#problemas-identificados-a-aplicação-deve-corrigir)).

## Opções consideradas

1. **Copiar ao abrir:** cada competência ganha a sua linha na primeira leitura. Mas um `GET` passaria a gravar no banco. E corrigir um mês não se propaga para os meses que já foram abertos, mesmo que ninguém tenha mexido neles.
2. **Copiar no fechamento do mês (job):** exige agendamento, e falha em silêncio se o job não rodar.
3. **Herança preguiçosa:** só a competência que alguém **salvou** tem linha. Ao ler uma competência sem linha, vale a última salva antes dela. Sem nenhuma salva, valem os percentuais padrão da planilha.

## Decisão

**Opção 3.**

- `GET /workspaces/:workspaceId/budget/:period` devolve a configuração com a origem:
  - `source: SAVED`: salva nesta competência;
  - `source: INHERITED`: herdada, com `inheritedFrom` indicando de qual competência;
  - `source: DEFAULT`: renda 0 e percentuais 60/20/15/5.
- `PUT /workspaces/:workspaceId/budget/:period` (EDITOR) grava a configuração inteira daquela competência, criando ou substituindo. Daí em diante, as competências seguintes herdam dela, até a próxima que for salva.
- A herança só vai **para a frente**: salvar novembro não muda outubro.
- **No banco:** uma linha por (espaço, competência), com RLS ([ADR 0028](0028-row-level-security.md)) e `CHECK`s que garantem competência válida, renda não negativa e percentuais de 0 a 100% com soma ≤ 100%.
- **Quatro destinos fixos** (colunas), como na planilha. Destinos configuráveis, como uma lista, ficam para quando houver necessidade: será um novo ADR, com migração dos dados.

## Consequências

- Ler nunca grava, e a resposta é sempre completa: o painel não precisa tratar "sem configuração".
- Corrigir uma competência salva propaga a correção para as seguintes que ainda não foram salvas. É o comportamento esperado de "copiar a anterior", mas sem cópias desatualizadas.
- A interface deve deixar claro quando a configuração é herdada ("herdada de setembro de 2026") e que salvar cria a configuração própria do mês.
- Não há como "voltar a herdar" depois de salvar. Se fizer falta, será um `DELETE` na mesma rota.
