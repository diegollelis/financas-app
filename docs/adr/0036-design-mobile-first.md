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
