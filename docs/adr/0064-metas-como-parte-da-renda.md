# 0064 — Metas como parte da renda líquida: limite e metas somam 100%

- **Status:** Aceita
- **Data:** 2026-10-29
- **Substitui:** a seção "Duas bases" do [ADR 0047](0047-orcamento-real-por-destino.md)

## Contexto

O [ADR 0047](0047-orcamento-real-por-destino.md) deu ao orçamento duas bases:

- o **limite de gastos** é um % da renda líquida;
- cada **meta** é um % da **sobra para guardar** (entradas − gastos).

Na prática, o Painel mostra "Limite de gastos 60%" e "Investimentos 50%, Reserva 30%, Viagens 20%". Esses números não somam nada que a tela mostre, e "50%" não diz de quê. O dono, que desenhou as duas bases, achou estranho ao registrar o orçamento. Também apontou três pontos:

- a sobra para guardar aparece negativa quando os gastos passam as entradas;
- o card "Orçamento do mês" fica vazio, com a renda líquida e as entradas do mês;
- "Gerenciar metas" fica escondido dentro de "Editar orçamento".

## Opções consideradas

1. **Manter as duas bases e explicar melhor:** escrever "50% da sobra" e mostrar o plano. A conta continua difícil de conferir de cabeça, e o valor de cada meta só se conhece no fim do mês.
2. **Uma base só, a renda líquida.** O limite, as metas e o que fica sem meta somam 100%, como na divisão 50/30/20. O plano fica conhecido no começo do mês. Em troca, as metas não crescem quando o mês sobra mais.

## Decisão

Opção 2.

- **Toda fatia do orçamento é um % da renda líquida:**
  - o limite de gastos e cada meta;
  - o que nenhum destino recebe aparece como **"Sem meta"**.
  - A soma de todas as fatias vai até 100%. A API recusa mais com `INVALID_INPUT`: "O limite de gastos e as metas somam no máximo 100% da renda líquida."
- **O valor de cada meta é fixo no mês:** `renda líquida × %`. As fatias são divididas juntas, para fechar no centavo (`splitShares`).
- **A sobra continua como um fato do mês, não como base:**
  - passa a se chamar **"Sobra prevista"** (`available`, entradas − gastos);
  - nunca aparece negativa: com os gastos acima das entradas, o Painel mostra R$ 0,00 e diz quanto passaram;
  - quando a sobra não cobre as metas, o Painel diz quanto falta; quando cobre, diz quanto ainda sobra.
- **Os orçamentos salvos são convertidos por uma migração:** `meta nova = meta × (100% − limite)`.
  - Por exemplo, 50% da sobra com limite de 60% vira 20% da renda. É o mesmo plano para um mês que sai como planejado, com as entradas iguais à renda e os gastos no limite.
  - A divisão inteira joga o resto do arredondamento em "Sem meta".
  - Sem limite (0%), a meta fica igual.
- **Meses fechados ([ADR 0063](0063-fechamento-do-mes.md)):** a migração desliga o trigger de `budget_shares` só durante a conversão. É uma mudança da regra, não uma edição. Num mês fechado, os valores das metas passam a seguir a nova conta. É o mesmo caso da marcação "Nem renda nem gasto", que o ADR 0063 já aceita.
- **Na tela:**
  - "Orçamento do mês" mostra o plano inteiro: a renda líquida e as entradas do mês, uma barra de 100% (gastos, metas e sem meta, com as cores do [ADR 0032](0032-graficos-sem-biblioteca.md)) e uma linha por destino com % e R$, até o total;
  - "Limite de gastos" e "Metas" continuam como cards de acompanhamento;
  - cada meta diz "20% da renda";
  - "Gerenciar metas" sai do diálogo do orçamento e vai para o card "Metas";
  - a partir de xl, as metas podem ser vistas em tabela ("Ver como", como em Lançamentos).

## Consequências

- **A conta fecha à vista:** 60% + 20% + 12% + 8% = 100%, e o valor de cada meta é conhecido no começo do mês.
- **Um mês que rende mais não aumenta as metas:** o que sobra além delas fica livre e aparece em "Sobra prevista". Um mês com menos entradas mantém as metas, e o Painel diz quanto falta para cumpri-las.
- **O formulário do orçamento fica mais simples:** todo campo é "% da renda", cada fatia mostra o valor em R$ ao ser digitada, e o total mostra quanto fica sem meta.
- **Próximos passos:**
  1. a conta, a API, a conversão e o formulário do orçamento;
  2. o Painel, com a prévia aprovada.
