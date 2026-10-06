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
