# 0032 — Gráficos sem biblioteca, com paleta validada

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

O painel do mês ([ADR 0031](0031-painel-do-mes-previsto-e-efetivado.md)) precisa de um gráfico. A planilha usa uma pizza "débitos pagos × saldo final". Comparar fatias de pizza é difícil, e uma pizza não tem lugar para o que ainda falta pagar.

As cores `--chart-1..5` que vieram com o shadcn/ui são tons de cinza, e nada as usa.

## Opções consideradas

1. **Recharts** (a base dos gráficos do shadcn/ui): pronto para linhas, eixos e tooltips, mas pesa no bundle e é mais uma dependência a manter, só para uma barra.
2. **HTML + CSS** (divs com largura proporcional): sem dependência e acessível, com o markup sob nosso controle. Basta para barras empilhadas e medidores, mas não escala para séries temporais.

## Decisão

**Opção 2, por enquanto.**

- O painel mostra uma **barra empilhada horizontal** ("para onde vão os créditos": débitos pagos, débitos a pagar, saldo previsto) e um **medidor** (despesas × meta). A legenda mostra os valores, e uma tabela repete os números do orçamento.
- As cores das séries ficam em `--chart-1..3` (`apps/web/src/index.css`), na ordem azul, laranja, verde-água. Foram validadas para daltonismo e contraste nos temas claro e escuro. O verde-água fica abaixo de 3:1 sobre o branco, por isso todo gráfico mostra os valores em texto.
- Status nunca depende só da cor: vencido tem ícone e texto, e valor negativo tem o sinal de menos.

## Consequências

- Nenhuma dependência nova. O gráfico é testado como o resto da página, pelo texto e pelo `aria-label`.
- Comparativos entre meses (fase 5) vão precisar de linhas e eixos. Será a hora de rever esta decisão, provavelmente adotando o Recharts com estas mesmas cores.
- Uma série nova usa a próxima cor da ordem validada, nunca uma cor inventada.

## Nota (2026-10-08, identidade visual)

Com a identidade CodeLélis ([ADR 0043](0043-identidade-visual-codelelis.md)), a paleta das séries foi reavaliada a partir das cores oficiais e **continua a mesma**.

- **Azul, ciano e menta da marca** (`#0066FF`, `#00C2FF`, `#00E6B8`) ficam próximos demais entre si e têm pouco contraste sobre o branco.
- **Verde e vermelho** (receitas e despesas) são o par que mais falha para daltonismo.

As cores validadas aqui ficam registradas como tokens derivados no ADR 0043.
