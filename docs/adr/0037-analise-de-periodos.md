# 0037 — Análise de períodos: somas na API, filtros no cliente e gráficos em SVG próprio

- **Status:** Aceita
- **Data:** 2026-10-06

## Contexto

O Painel ([ADR 0031](0031-painel-do-mes-previsto-e-efetivado.md)) mostra uma competência. Para avaliar os gastos e os recebidos ao longo de vários meses, é preciso juntar competências e filtrar por tipo, categoria e visão (previsto ou efetivado). É o item "comparativos entre meses e gastos por categoria ao longo do tempo" do roadmap.

O [ADR 0032](0032-graficos-sem-biblioteca.md) desenhou os gráficos do Painel em HTML/CSS e deixou registrado que as séries temporais exigiriam rever a decisão.

## Opções consideradas

**Onde calcular**

1. **Uma rota por visão e por filtro** (evolução, ranking, categoria): cada troca de filtro vira uma nova chamada à API, e no plano gratuito do Render uma chamada pode esperar o _cold start_.
2. **A API soma, o cliente filtra:** uma rota devolve as somas por competência, tipo e categoria, de todos os lançamentos (previsto) e dos efetivados. Funções puras em `packages/shared` montam cada visão. Só o período vai ao servidor.

**Como desenhar**

1. **Recharts:** eixos e _tooltips_ prontos, mas cerca de 100 KB a mais no celular e uma dependência a manter.
2. **SVG próprio:** poucos tipos de gráfico (colunas, linha, barras horizontais), desenhados sob nosso controle e sem dependência.

## Decisão

- **A API soma, o cliente filtra** (opção 2):
  - a rota é `GET /workspaces/:workspaceId/analysis?from=AAAA-MM&to=AAAA-MM`, liberada para todo membro;
  - ela devolve `rows: [{ period, type, categoryId, plannedCents, settledCents }]` com dois `groupBy` do Prisma, sempre por `forWorkspace` (RLS);
  - **só somas** saem do banco, nunca descrições ou valores individuais.
  - **Tamanho da resposta:** cabe com folga, com no máximo 24 competências × cerca de 40 categorias × 2 tipos.
- **Limite de 24 competências**, o bastante para comparar um mês com o mesmo do ano anterior. Intervalo invertido ou maior dá 400 `INVALID_INPUT` com mensagem em pt-BR (`analysisQuerySchema`).
- **Funções puras** em `packages/shared/src/analysis.ts`:
  - `monthlySeries`: uma competência por ponto, e **os meses sem lançamento entram como zero** para não sumir do gráfico;
  - `seriesTotals`;
  - `categoryRanking`: débitos, ou créditos quando o filtro de tipo pede, com média mensal sobre todos os meses do intervalo e participação em pontos-base;
  - `categorySeries`.
- **Gráficos em SVG próprio** (opção 2), seguindo a skill `dataviz`:
  - um único eixo, em reais;
  - legenda;
  - _tooltip_ ao tocar ou passar o mouse;
  - "Ver como tabela" com os mesmos números;
  - valores em texto nas cores de texto, nunca na cor da série.
- **Cores:** créditos `--chart-1`, débitos `--chart-2` e saldo `--chart-3`, na ordem fixa do ADR 0032.
  - O validador da skill `dataviz` foi rodado nos dois temas (claro sobre `#ffffff`, escuro sobre `#0a0a0a`): faixa de luminosidade, croma e separação para daltonismo (ΔE ≥ 9,2) passam.
  - O verde-água fica em 2,82:1 sobre o branco, por isso os valores sempre aparecem em texto (_tooltip_, legenda com totais e tabela).

## Consequências

- Trocar o tipo, as categorias ou a visão não faz nova chamada à API. Trocar o período faz.
- O ADR 0032 continua valendo para o Painel. As séries temporais seguem este ADR.
- Uma visão nova (por exemplo, recebidos por categoria em gráfico próprio) é mais uma função pura sobre as mesmas linhas, sem rota nova.
- Se um dia os gráficos precisarem de zoom ou de muitas séries, rever a opção do Recharts.

## Nota (página "Análise", 2026-10-06)

- **Rota `/espacos/:id/analise`**, no "Mais" do celular e no menu lateral.
- **Filtros no endereço** (`features/analysis/filters.ts`): `?periodo=3|6|12|ano` ou `?de=AAAA-MM&ate=AAAA-MM`, mais `visao=efetivado`, `tipo=creditos|debitos` e `categorias=id,id`.
  - O padrão é "últimos 6 meses, previsto".
  - Um valor inválido volta ao padrão.
  - No intervalo personalizado, a outra ponta se ajusta para manter a ordem e o limite de 24 meses.
- **Filtros na tela:** atrás do botão "Filtros" (gaveta) no celular e num quadro acima dos resultados a partir de `md`. Uma linha sob o título resume o que está ativo.
- **Totais do período:** o saldo em destaque quando os dois tipos estão na tela; com um tipo só, "Recebido no período" ou "Gasto no período".
- **Gráfico mês a mês** (`features/analysis/monthly-chart.tsx`):
  - colunas de créditos e débitos e a linha do saldo, num eixo em reais com rótulos compactos ("R$ 4 mil");
  - desenhado na largura real do container (`useElementWidth`), sem esticar o SVG;
  - com meses demais para a tela (menos de 44 px por mês), rola dentro da própria caixa;
  - "Ver como tabela" mostra os mesmos números.
- **_Tooltip_:** segue o mouse; no toque, abre e fecha a cada toque no mês. Tratar os dois do mesmo jeito fazia o _tooltip_ abrir e fechar no mesmo toque: o evento de "entrar" abria e o "clique" fechava, e um dedo "sai" do elemento logo depois de tocar.
