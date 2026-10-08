# 0043 — Identidade visual `<CodeLélis/> Finanças`

- **Status:** Aceita
- **Data:** 2026-10-08

## Contexto

Até aqui, o app usava uma identidade provisória: um quadrado índigo com "R$", a cor de marca índigo e a fonte Geist ([ADR 0036](0036-design-mobile-first.md)). O dono do projeto aprovou uma identidade própria, entregue como um pacote de artes raster (PNG). O pacote fica fora do repositório:

- o símbolo **CL**;
- a marca **`<CodeLélis/>`** e o produto **`<CodeLélis/> Finanças`**, nas versões horizontal, vertical, clara, escura e monocromática;
- os ícones de app, claro e escuro;
- uma paleta e um dashboard de referência.

`codelelis.com` vai reunir vários apps de estudo. **CodeLélis é a marca-mãe, e Finanças é o produto.**

**O que as artes trazem, e por que isso pesa:**

- **Arquivos pesados:** de 1 a 2 MB cada.
- **Fundo sólido:** a maioria não tem transparência. Na web, o fundo apareceria como um retângulo sobre o app.
- **Funções que o app não tem:** o dashboard de referência mostra contas e cartões (com logos de bancos), investimentos, patrimônio, metas, notificações e "% vs. mês anterior".
- **Cores sem contraste para texto:** algumas cores da paleta, usadas como texto, ficam abaixo do mínimo do WCAG.

## Opções consideradas

**Arquivos da marca**

1. **Usar as artes como estão:** pesadas, e o fundo aparece como um retângulo.
2. **Redesenhar em SVG ou CSS:** é proibido pelo dono, porque mudaria a arte aprovada.
3. **Derivar sem redesenhar:** recortar, reduzir e tirar o fundo liso, sem tocar em forma nem cor, e trocar por um SVG profissional quando houver.

**Barra lateral**

1. **Marinho mesmo no tema claro,** como na referência.
2. **No tom da superfície de cada tema:** clara no claro e marinho no escuro, o padrão da maioria dos apps (Linear, Notion, GitHub, Stripe, Vercel).

**Design system**

1. **Substituir** o sistema atual.
2. **Refatorar** parte dele.
3. **Manter os tokens e trocar os valores.**

**Escopo do dashboard de referência**

1. **Visual e funções novas** nesta fase.
2. **Só a linguagem visual** nas telas que existem.

## Decisão

**Nome**

| Onde                                                                                                                    | Como fica                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Logo (arte)                                                                                                             | `<CodeLélis/> FINANÇAS`                                                                         |
| Lugares sem a logo ao lado: título da aba, nome do app instalado, remetente e assunto dos e-mails, termos e privacidade | **"CodeLélis Finanças"**, sem os sinais `< />`, que leitores de tela e filtros de spam leem mal |
| Dentro do app, onde a logo aparece, e no `short_name` do manifesto                                                      | **"Finanças"**                                                                                  |

O acento de "Lélis" é obrigatório em todo lugar.

**Arquivos da marca: derivados, nunca redesenhados**

- **O script `apps/web/scripts/brand-assets.ts`,** com `sharp`, lê o pacote por um caminho passado como argumento. Ele recorta, reduz e torna transparente o fundo liso de cada arte aprovada, sem mexer nas formas nem nas cores.
- **O que ele gera, em `public/brand/`:**
  - os símbolos e as logos, nas versões clara e escura;
  - o favicon e o `apple-touch-icon`;
  - os ícones de 192 e 512 px e um ícone `maskable`.
- **Só os arquivos gerados entram no repositório.** O pacote original (39 MB) fica fora.
- **Quando vier um SVG profissional,** ele substitui os arquivos gerados, e o script deixa de ser necessário.

**Paleta: os tokens continuam, os valores mudam (design system mantido)**

**Tons da marca**

| Token                                                          | Claro                                                                                        | Escuro                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Primária                                                       | `#0066FF`, contraste de 4,8:1 sobre o branco: serve para texto e para botão com texto branco | um tom mais claro, que passe no contraste sobre o marinho |
| `--brand-secondary` (`#00C2FF`) e `--brand-accent` (`#00E6B8`) | só decoração e gráficos, **nunca em texto** (cerca de 2:1)                                   | —                                                         |

**Neutros:** `#F8FAFC` (fundo), `#FFFFFF` (superfície), `#E2E8F0` (borda), `#0F172A` (texto), `#64748B` (texto secundário) e `#94A3B8` (desabilitado).

**Tema escuro marinho:** `#0A1F3D` (fundo), `#11284A` (superfície), `#1E3A8A` (borda) e `#1F3B6D` (hover).

**Cores semânticas**

| Uso           | Tom da referência | Quando o tom serve                               |
| ------------- | ----------------- | ------------------------------------------------ |
| Receitas      | `#16A34A`         | preenchimento, ícone, contorno e fundo `*-muted` |
| Despesas      | `#EF4444`         | o mesmo                                          |
| Alertas       | `#F59E0B`         | o mesmo                                          |
| Investimentos | `#8B5CF6`         | reservado: o app ainda não tem investimentos     |
| Informação    | `#3B82F6`         | preenchimento e ícone                            |

**Texto em cor semântica** usa variantes escurecidas, com 4,5:1 ou mais, porque os tons da referência não chegam a isso sobre o branco (receitas, cerca de 3,3:1).

**Garantia:** um teste calcula o contraste dos pares de tokens nos dois temas e falha abaixo de 4,5:1 para texto e de 3:1 para elementos de interface.

**Outras regras visuais**

- **Fonte:** Inter (`@fontsource-variable/inter`, no lugar da Geist), com a escala 32/24/20/16/14/12.
- **Raio:** `--radius: 0.75rem`.
- **Sombras:** só a leve, nos indicadores do Painel. O resto continua com bordas.
- **Gradiente da marca** (`#0066FF → #00C2FF → #00E6B8`): **só na arte**, no símbolo e na logo. Botões e superfícies usam cores sólidas, e a regra contra gradientes decorativos (ADR 0036) continua.
- **Ícones:** Lucide, que já é de contorno com traço 2, como na referência.

**Barra lateral:** no tom da superfície de cada tema, clara no claro e marinho no escuro, com a logo no topo e o azul da marca no item ativo.

**Escopo**

- **Entra:** só a linguagem visual, aplicada às telas que existem.
- **Fica fora:**
  - contas e cartões, investimentos, patrimônio, metas, notificações e "% vs. mês anterior": cada um, se vier, terá ADR próprio;
  - **logos de bancos e de outras marcas, em qualquer caso**, porque o repositório é público.

**Ordem dos PRs:**

1. este ADR;
2. os arquivos da marca;
3. os tokens;
4. a moldura do app (cabeçalho, barra lateral, `AuthCard`);
5. o Painel e os gráficos (paleta revalidada, com nota no [ADR 0032](0032-graficos-sem-biblioteca.md));
6. os e-mails e os textos;
7. a revisão em capturas.

## Consequências

- **A troca é quase toda de valores de tokens:** as telas herdam a identidade sem reescrita, e só a moldura do app e o Painel ganham ajustes de estrutura.
- **Arquivos raster pequenos podem perder detalhes:** o favicon a 16 px precisa ser conferido. Se o CL colorido borrar, o favicon usa a versão monocromática, que também é do pacote.
- **O tema escuro muda de cinza para marinho:** todas as telas precisam de captura nos dois temas antes do merge do PR de tokens.
- **O nome muda nos e-mails:** depois do deploy, `MAIL_FROM_NAME` no Render passa a ser "CodeLélis Finanças".
- **A skill `financas-ui` passa a descrever a marca e essas regras.**
