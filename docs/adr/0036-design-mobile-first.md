# 0036 — Interface mobile first, sóbria, com regras numa skill do projeto

- **Status:** Aceita
- **Data:** 2026-10-05

## Contexto

Nas fases 1 a 4, o front foi feito de propósito do jeito mais simples: o foco era percorrer o caminho até o deploy. O app agora está no ar, e o uso principal é no celular: lançar uma conta na hora e conferir o saldo do mês. Uma auditoria do `apps/web` encontrou:

- **Sem navegação:** não há cabeçalho nem menu. Para ir de Lançamentos ao Painel, é preciso voltar à página do espaço.
- **Pouco espaço útil:** cada página é um cartão centralizado com `p-6`, o que deixa cerca de 280 px úteis num celular de 360 px.
- **Toques pequenos:** os botões têm 28 a 32 px. A `PeriodNav` usa links de texto.
- **Lançamentos:** o formulário de criação fica no fim da página, depois das listas.
- **Painel:** a tabela rola para o lado.
- **Estados pobres:** "Carregando…" em texto puro, sem aviso do _cold start_ de cerca de 1 minuto do Render ([ADR 0033](0033-topologia-e-limites-do-deploy.md)), sem toasts e sem "tentar de novo".
- **Marcas de interface gerada por IA:** setas `→` em links e trechos ligados por `·`.

O Claude Code passou a usar _skills_ (instruções que ele carrega quando o assunto aparece). Existe uma oficial de design, o plugin `frontend-design`, que cuida da direção estética, mas não de _mobile first_, acessibilidade, shadcn/ui nem das convenções deste projeto.

## Opções consideradas

**Onde guardar as regras de interface**

1. **Só no `CLAUDE.md`:** já é lido em toda sessão, mas ficaria longo, e regras de front pesariam também em trabalho de API.
2. **Uma skill do projeto** (`.claude/skills/financas-ui/`): versionada, carregada só quando o trabalho é no front, e pode conter checklists.

**Direção visual**

1. **Identidade marcante:** mais personalidade, mais decisões de gosto e mais risco de distrair num app de dinheiro.
2. **Sóbria, com uma cor de marca:** base neutra, uma cor para ações e destaques, números grandes e legíveis.

**Navegação**

1. **Menu no topo:** simples, mas longe do polegar.
2. **Barra inferior no celular e menu lateral no desktop:** o padrão dos apps de banco.

## Decisão

- **Skills:** o plugin oficial `frontend-design`, habilitado no escopo do projeto (`.claude/settings.json`), dá a direção estética. A skill do projeto **`financas-ui`** é o _brief_ que ele manda seguir e guarda as regras abaixo. Quando as duas divergirem, vale a do projeto.
- **Mobile first:** a base é desenhada para 360 px, e as telas maiores são acréscimos (`sm` 640, `md` 768, `lg` 1024). Nenhuma tela tem rolagem horizontal.
- **Visual sóbrio, com uma cor de marca.** Ela é usada em ações e destaques, junto com cores semânticas (sucesso, alerta, perigo), todas como _tokens_ com variante de tema escuro. Os gráficos seguem a paleta do [ADR 0032](0032-graficos-sem-biblioteca.md).
- **Navegação:** barra inferior abaixo de `md` (Painel, Lançamentos, Orçamento, Mais) e menu lateral a partir de `md`, num layout comum a todas as telas de um espaço.
- **Toques de pelo menos 44 px** no celular e **valores com `tabular-nums`**.
- **Formulários:** em _Sheet_ (gaveta que sobe de baixo) no celular e em _Dialog_ no desktop. A ação principal fica sempre ao alcance, como um "Novo lançamento" fixo.
- **Estados obrigatórios:**
  - carregando, com _skeleton_ e um aviso de "acordando o servidor" depois de alguns segundos;
  - vazio, com convite à ação;
  - erro, com a causa e um "tentar de novo".
- **Retorno e segurança:** toast depois de cada mudança e confirmação (`AlertDialog`) antes de excluir.
- **Acessibilidade:** nomes acessíveis em todo controle, foco visível e devolvido após fechar um diálogo, contraste mínimo de 4,5:1 no texto e _skip link_.

## Consequências

- **A reforma vai em PRs pequenos** (roadmap, fase 5):
  1. fundação visual: cor de marca, _tokens_, tamanhos e componentes do shadcn;
  2. layout com navegação e estados;
  3. as telas, uma por PR.
- **Testes:** continuam consultando por _role_ e _label_. Quando a estrutura mudar (uma tabela que vira cartões, um `<select>` nativo que vira o do shadcn), a asserção é reescrita sobre o que a pessoa vê.
- **Verificação de PRs de interface:** além do CI, capturas em 360, 768 e 1280 px de largura.
- **Plugin de terceiros:** ele vem da Anthropic, e o `.claude/settings.json` registra só que ele está habilitado. A versão fica no cache de cada máquina, então atualizações do plugin podem mudar a orientação estética. A skill do projeto é a parte estável.
- **Revisar** se o app ganhar outra plataforma (app nativo ou PWA completo) ou se a direção visual mudar.

## Nota (fundação visual, 2026-10-05)

- **Cor de marca: índigo** (`#3f47c4` no tema claro, `#8f96f2` no escuro), escolhido entre índigo, petróleo e ameixa numa comparação aplicada à tela de lançamentos. O azul-marinho foi descartado por se confundir com o azul dos gráficos. Contraste do texto sobre a cor: 7,2:1 no claro e 7,4:1 no escuro.
- **Tokens semânticos** `success` e `warning`, cada um com uma versão `-muted` para fundos e com variante escura. Todas as combinações de texto têm 5,8:1 ou mais. O `Badge` ganhou as variantes `success` e `warning`.
- **44 px abaixo de `md`** em `Button`, `Input`, `Select` e nos itens de `DropdownMenu`. Os tamanhos compactos do shadcn valem a partir de `md`.
- **Componentes do shadcn adicionados:** `sheet`, `dialog`, `alert-dialog`, `sonner`, `skeleton`, `select`, `radio-group` e `dropdown-menu`. O CLI tenta sobrescrever o `button.tsx`; a resposta deve ser "não".
- **Ícones:** favicon em índigo, `apple-touch-icon` e ícones de 192 e 512 px gerados a partir dele, mais `manifest.webmanifest` e `theme-color`.
- **Capturas e checagens:** `pnpm --filter @financas/web screenshots` (`apps/web/scripts/screenshots.ts`, com Playwright) fotografa as telas em 360, 768 e 1280 px com um usuário fictício local e aponta rolagem horizontal e alvos de toque menores que 44 px no celular.

## Nota (layout dos espaços, 2026-10-05)

- **Rota de layout `WorkspaceLayout`** (`features/workspaces/workspace-layout.tsx`) envolve todas as páginas de `/espacos/:workspaceId`. Ela tem:
  - o cabeçalho com o nome do espaço e o menu da conta ("Seus espaços" e "Sair");
  - as seções numa barra inferior abaixo de `md` (Painel, Lançamentos, Orçamento e "Mais", que abre uma gaveta com Categorias, Membros e Seus espaços) e num menu lateral a partir de `md`. É um único `<nav>` que muda de forma com o tamanho da tela;
  - o _skip link_ "Pular para o conteúdo" e o `<main id="conteudo">`.
- **O espaço é carregado uma vez, no layout.** Carregando, com 404 ou com erro, o próprio layout mostra o estado; as páginas só aparecem com o espaço carregado e o leem com `useCurrentWorkspace()`. Custo: as consultas da página começam depois da do espaço (uma ida e volta a mais), o que é aceitável perto do _cold start_.
- **Trocar de seção mantém a competência** (`?competencia=`) entre Painel, Lançamentos e Orçamento.
- **`QueryState`** (`components/query-state.tsx`) mostra o _skeleton_, o aviso de "Acordando o servidor…" depois de 3 s, "Espaço não encontrado." com o caminho de volta, ou o erro com "Tentar de novo". Substituiu o bloco repetido nas cinco páginas.
- **`PeriodNav`** virou botões de 44 px (anterior, próxima e "Mês atual"), ainda como links, porque navegam.
- **A página `/espacos/:workspaceId`** deixou de ser um índice de links e passou a ser "Membros". A lista de espaços da página inicial abre direto o Painel.

## Nota (página inicial e tema, 2026-10-05)

- **Tema Sistema, Claro ou Escuro**, escolhido no menu da conta. O padrão é **Sistema**, que segue o aparelho e muda sozinho quando o celular entra no modo noturno.
  - A escolha fica só neste navegador (`localStorage`, chave `financas-tema`) e não vai para a API.
  - Sem armazenamento disponível, vale Sistema.
  - O código fica em `apps/web/src/lib/theme.ts` (`useTheme`).
- **Sem clarão branco ao abrir:** `public/theme-init.js` roda no `<head>`, antes do CSS e do JavaScript do app, e aplica a classe `.dark`, o `color-scheme` e o `theme-color` (`#ffffff` ou `#0a0a0a`).
  - É um arquivo externo, e não um script _inline_, para não exigir exceção numa futura CSP.
  - Ele repete o mínimo de `theme.ts`; os dois precisam andar juntos.
- **Cabeçalho comum** (`features/shell/`): `AppHeader`, `AccountMenu` e `SkipLink`, usados pelo layout dos espaços e pela página inicial.
- **Página inicial no padrão novo:**
  - mesmo cabeçalho e margens, sem as abas, porque nenhum espaço foi escolhido ainda;
  - os espaços aparecem como linhas tocáveis que abrem o Painel;
  - "Sair" fica no menu da conta.
  - O selo "Status da API" saiu, e o aviso de _cold start_ do `QueryState` ocupa o lugar dele.
- **Capturas:** o script também fotografa o tema escuro a 360 e 1280 px (`*-escuro.png`).

## Nota (Lançamentos, 2026-10-05)

- **Cada lançamento é um cartão** numa lista com borda por seção: descrição, categoria, vencimento, observações e o selo de status à esquerda, e o valor em destaque à direita.
- **Uma ação na linha, o resto no menu:** "Efetivar" fica visível enquanto o lançamento está pendente. Editar, "Desfazer efetivação" e Excluir ficam no menu "⋯" (`Ações de <descrição>`).
- **Excluir pede confirmação** num `AlertDialog` que nomeia o lançamento e o valor. Depois de excluir, o foco vai para o título da seção, porque a linha que tinha o foco sumiu.
- **Formulário em gaveta no celular e em diálogo a partir de `md`** (`components/responsive-dialog.tsx`, que escolhe pelo `useMediaQuery`).
  - "Novo lançamento" fica fixo acima da barra inferior no celular e ao lado do título no desktop.
  - Cada abertura remonta o formulário, então nenhum erro da tentativa anterior sobra.
  - Ao fechar, o foco volta ao botão que abriu o formulário.
- **Tipo e categoria:**
  - o tipo virou um controle segmentado "Débito | Crédito" (`RadioGroup` do Radix, 44 px), no lugar dos _radios_ nativos;
  - a categoria usa o `Select` do shadcn.
- **Toasts** (`sonner`, no topo, montados em `components/root-layout.tsx`) depois de cada mudança: "Lançamento adicionado", "salvo", "efetivado", "excluído" e "Efetivação desfeita". As falhas também aparecem num toast.
- **Exclusão com `mutateAsync`:** os _callbacks_ de `mutate()` não rodam se o componente for desmontado antes, e a linha some justamente quando a exclusão dá certo.
- **Testes:** o `mockApi` responde 204 sem corpo, porque `Response.json` falha nesse caso. O _setup_ ganhou os _stubs_ que o Radix precisa no jsdom (`ResizeObserver` e captura de ponteiro), e o `matchMedia` falso responde "celular" para consultas de largura.

## Nota (Painel, 2026-10-05)

- **Um número em destaque:** o **saldo previsto** abre o mês em tamanho grande (36 px no celular, 48 px a partir de `sm`), como recomenda a skill `dataviz` (um destaque por tela).
  - Saldo efetivado, resultado previsto e resultado efetivado vêm abaixo, como linhas no celular e em três blocos a partir de `sm`.
  - Os valores isolados usam algarismos proporcionais; `tabular-nums` fica só onde os números se alinham em coluna.
- **Vencidos** num aviso com a cor semântica de alerta (`warning`), ícone e texto, e o botão "Ver lançamentos" com 44 px.
- **Orçamento por destino:** um cartão por destino no celular, já que as cinco colunas da tabela não cabem em 360 px, e a tabela a partir de `md`. A escolha usa o `useMediaQuery`, não `hidden`/`md:table`, para que o leitor de tela e os testes encontrem uma só versão.
- **Créditos e débitos** em linhas "rótulo e valor", em duas colunas a partir de `sm`.
- **Testes:** `stubPrefersDark(dark, { desktop: true })` simula uma tela de `md` em diante.

## Nota (Orçamento, Categorias, Membros e login, 2026-10-05)

- **Login, cadastro, senha e convite** (`AuthCard`): no celular, a tela inteira é o formulário, sem cartão em volta; a partir de `sm`, um cartão centralizado. O ícone e o nome "Finanças" aparecem no topo.
- **`TextLink`** (`components/text-link.tsx`): link com cara de texto ("Cadastre-se", "Esqueci minha senha") e 44 px de altura no celular.
- **`SegmentedControl`** (`components/segmented-control.tsx`): escolha entre poucas opções em segmentos grandes (`RadioGroup` do Radix). Usado no tipo do lançamento e no acesso do convite ("Pode editar" ou "Só visualizar").
- **Orçamento:** campos em uma coluna no celular, "Orçamento salvo" em toast e o `·` trocado por uma frase ("Soma: 97,5%. Sem destino: 2,5%").
- **Categorias:** cada categoria tem um menu "⋯": Renomear e Arquivar quando ativa, Reativar e Excluir quando arquivada.
  - Renomear abre a gaveta ou o diálogo.
  - Excluir pede confirmação, e a recusa da API (categoria em uso) aparece num toast.
  - Toda ação usa `mutateAsync`, porque arquivar, reativar e excluir tiram a linha da lista.
- **Membros:** linhas com nome e e-mail.
  - Cancelar um convite pede confirmação ("Manter convite" ou "Cancelar convite"), já que o link do e-mail deixa de funcionar.
  - "Convite enviado" e "Convite cancelado" aparecem em toasts.
- **Testes:** o _setup_ chama `toast.dismiss()` depois de cada teste, porque o `sonner` guarda os toasts num estado global e o toast de um teste aparecia no seguinte.
- **Resultado:** a checagem de celular das capturas não aponta mais nenhum alvo menor que 44 px nem rolagem horizontal, em nenhuma tela.

## Nota (seletor de espaço, 2026-10-05)

- **A página de espaços saiu.** Ela era a única tela sem o menu, porque as seções pertencem a um espaço e ali nenhum estava escolhido.
  - Agora o nome do espaço no cabeçalho é um **seletor** (`features/workspaces/workspace-switcher.tsx`): lista os espaços com o atual marcado e cria um novo ("Novo espaço compartilhado", em `ResponsiveDialog`).
  - É o padrão de apps com vários espaços de trabalho.
- **Trocar de espaço mantém a seção e a competência:** de `/espacos/A/lancamentos?competencia=…` vai para `/espacos/B/lancamentos?competencia=…`.
- **`/` não é mais uma página:** abre o Painel do último espaço usado neste navegador (`localStorage`, chave `financas-ultimo-espaco`) ou, sem ele, o espaço pessoal.
  - Só um espaço que carregou é guardado, para que um 404 não vire o destino.
  - O redirecionamento repassa a _query string_, porque o link de confirmação de e-mail volta com `?error=`.
- **O aviso de confirmar o e-mail** aparece no topo de todas as páginas do espaço até a confirmação. "Seus espaços" saiu do menu da conta e da gaveta "Mais".
- **Estado vazio que não repete a ação:** em Lançamentos, o mês vazio diz o que falta e aponta "Novo lançamento", que já está na tela, em vez de mostrar um segundo botão ("cada elemento faz um trabalho", da skill `frontend-design`). A regra entrou na skill `financas-ui`.

## Nota (gaveta acima do teclado, 2026-10-06)

- **Problema:** no celular, o teclado virtual cobria o campo da gaveta, como em "Novo espaço compartilhado". O Chrome no Android (desde a versão 108) e o Safari no iOS encolhem só a _visual viewport_ quando o teclado abre, e um elemento `position: fixed; bottom: 0` continua no fundo da tela, atrás do teclado.
- **Solução:** `useKeyboardInset` (`lib/use-keyboard-inset.ts`) lê a `window.visualViewport` e informa quanto da tela o teclado cobre. A gaveta do `ResponsiveDialog` usa esse valor como `bottom` e limita a própria altura ao que sobra visível. Quando o teclado abre, o campo em foco rola para dentro da área visível.
- **Por que não `interactive-widget=resizes-content`:** essa opção da _meta viewport_ faria a barra de abas subir junto com o teclado em todo formulário, e não vale no iOS. A barra continua atrás do teclado, como nos apps nativos.
