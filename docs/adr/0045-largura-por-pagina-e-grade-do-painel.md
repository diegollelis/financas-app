# 0045 — Largura por página e grade do Painel

- **Status:** Aceita
- **Data:** 2026-10-08

## Contexto

Toda página de um espaço tinha a mesma largura máxima, 768 px (`max-w-3xl`, na `WorkspaceLayout`, [ADR 0036](0036-design-mobile-first.md)). Para listas e formulários, é a largura certa de leitura. O Painel, porém, é um conjunto de blocos. Numa tela de 1920 px, sobrava mais da metade da área à direita, e tudo ficava numa coluna só, com mais rolagem do que o necessário. A avaliação externa do Painel deu nota baixa justamente ao "aproveitamento do desktop".

Esticar o conteúdo para a largura toda também seria ruim: as linhas de rótulo e valor ficariam longas demais para ler.

## Opções consideradas

1. **Aumentar a largura de todas as páginas:** as listas e os formulários perdem a largura de leitura.
2. **Largura por página:** cada rota diz se precisa de mais espaço.
3. **Esticar o Painel até a largura toda:** linhas gigantes, sem ganho de leitura.

## Decisão

**Largura por página (opção 2):**

- uma rota pede a coluna larga com `handle: { wide: true }`;
- a `WorkspaceLayout` lê os `handle` da rota atual (`useMatches`) e usa `max-w-6xl` (cerca de 1150 px) em vez de `max-w-3xl`;
- o rodapé acompanha a mesma largura;
- as outras páginas não mudam.

O Painel e a Análise usam a coluna larga. Na Análise, do xl em diante, "Mês a mês" fica ao lado das categorias, com os totais em cima.

**A grade do Painel:**

- **Até o xl** (1280 px), uma coluna, como antes.
- **Do xl em diante**, duas colunas, com estas linhas:
  1. o aviso de vencidos e "Saldo e resultado", na largura toda;
  2. "Créditos e débitos" ao lado de "Para onde vão os créditos";
  3. "Despesas e meta" ao lado de "Orçamento por destino".
- **A legenda do gráfico,** que fica em linha do sm em diante, volta a ser uma lista no xl, onde o gráfico ocupa meia coluna.

**Outras decisões da mesma rodada:**

- **"Despesas e meta" sem renda definida** vira um estado vazio com ação. O botão é "Definir renda" para quem edita, e "Ver orçamento" para quem só lê.
- **Os indicadores ficam sem ícone.** Um ícone neles seria só enfeite: a simplicidade funciona, e a avaliação externa concordou.
- **A paleta dos gráficos continua a do [ADR 0032](0032-graficos-sem-biblioteca.md),** como diz a nota de lá.

## Consequências

- **O desktop largo é aproveitado** sem esticar linhas, e o celular não muda.
- **Uma página nova de blocos** (a Análise, por exemplo) só precisa do `handle` e da sua própria grade.
- **As capturas do Painel** passam a ser conferidas também em 1920 px.

## Nota (2026-10-09): "Orçamento por destino" em três blocos

Com o [ADR 0047](0047-orcamento-real-por-destino.md), Despesas e os destinos de guardar têm bases diferentes. Despesas é um percentual da renda líquida; cada destino de guardar é um percentual do que sobra depois das despesas. Uma tabela só, com uma coluna "%" para todos, levava a somar percentuais que não se somam. A seção passa a ter três blocos:

1. **Despesas:** o medidor da meta, mais Pago, A pagar e **Usado da meta** (pago + a pagar, sobre a meta, o mesmo número do medidor).
2. **O que sobra para guardar:** a conta Créditos previstos − Despesas previstas = Disponível para guardar, a base das metas de guardar.
3. **Destinos de guardar:** a tabela (cartões no celular) só com eles. Uma linha **"Sem destino"** aparece quando a soma fica abaixo de 100%; o valor vem do resumo (`unallocated`, calculado em `summarizePeriod`). A linha **Total** mostra 100% e o próprio disponível, porque a soma das metas arredondadas pode errar por um centavo.

Do xl em diante, os blocos 1 e 2 ficam lado a lado, e a tabela ocupa a largura toda embaixo.
