# 0046 — Orçamento editado no Painel, em um modal

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

O orçamento de uma competência tinha página própria, `/espacos/:workspaceId/orcamento` ([ADR 0030](0030-orcamento-por-competencia-com-heranca.md)). A página tinha duas partes:

- **um resumo** (renda e percentuais em reais), quase todo repetido pelo Painel em "Orçamento por destino", que ainda mostra a meta, o previsto e o efetivado;
- **o formulário de edição** (`BudgetForm`), a única parte própria da página.

Para editar, a pessoa saía do Painel e voltava para ver o efeito. A página também ocupava uma das quatro abas da barra inferior do celular ([ADR 0036](0036-design-mobile-first.md)).

## Opções consideradas

1. **Manter a página.**
2. **Editar no Painel, num modal,** e tirar a página.
3. **Editar no próprio bloco do Painel, sem modal:** o formulário de seis campos alongaria o Painel e misturaria leitura com edição.

## Decisão

**Opção 2.**

**O modal (`BudgetDialog`, `features/budget/budget-dialog.tsx`):**

- **Onde aparece:** o `ResponsiveDialog`, como os outros formulários: uma folha que sobe da base no celular e um modal do md em diante.
- **O conteúdo:** o mesmo `BudgetForm`, agora com "Cancelar".
- **O texto:** o título é "Orçamento de outubro de 2026". A descrição avisa que o orçamento vale para esse mês e para os seguintes sem orçamento próprio, e o texto de origem (salvo, herdado ou padrão) continua, com o aviso "Ao salvar, … passa a ter o seu próprio orçamento".
- **Ao salvar:**
  - aparece o aviso "Orçamento salvo";
  - o modal fecha e o foco volta para o botão que o abriu;
  - o Painel se atualiza, porque o salvamento já invalida os resumos (`useSaveBudget`).

**O que abre o modal:**

- "Editar orçamento", em "Orçamento por destino";
- "Definir renda", no estado vazio de "Despesas e meta" ([ADR 0045](0045-largura-por-pagina-e-grade-do-painel.md)).

Os dois aparecem só para quem edita (EDITOR e OWNER). Quem só lê (VIEWER) vê os números, sem botão.

**No Painel:** "Orçamento por destino" passa a mostrar a **renda líquida**, que antes só aparecia na página do orçamento.

**O endereço antigo:** `/orcamento?competencia=…` redireciona para o Painel do mesmo mês (`BudgetRedirect`), para não quebrar favoritos nem o histórico do navegador.

**A navegação:** Orçamento sai das seções, e **Análise** passa a ocupar a aba livre da barra inferior do celular. As abas ficam Painel, Lançamentos, Análise e Mais.

## Consequências

- **Editar o orçamento** se faz onde o efeito aparece, sem trocar de tela.
- **A Análise** ganha acesso direto no celular.
- **O ADR 0030 continua valendo** para a API e a herança, e muda só onde o orçamento é editado. A lista de seções do ADR 0036 muda como descrito acima.
- **Se um dia o orçamento crescer,** com metas por categoria ou histórico, por exemplo, ele pode voltar a merecer uma página. Aí vale um ADR novo.
