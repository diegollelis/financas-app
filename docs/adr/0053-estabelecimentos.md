# 0053 — Estabelecimentos: onde se comprou ou quem pagou

- **Status:** Aceita
- **Data:** 2026-10-13

## Contexto

Um lançamento diz **o quê** (a categoria: Mercado, Assinaturas) e, desde o [ADR 0042](0042-pessoas-e-rateio.md), **com quem** (a pessoa: a Ana me deve, eu devo ao Bruno). Falta dizer **onde**: em qual mercado se comprou, qual serviço cobrou, qual empresa pagou. Com isso dá para responder perguntas como "quanto foi para cada mercado este ano?" e, mais adiante, sugerir a categoria pelo estabelecimento.

O dono do projeto pensou em cadastrar as lojas como Pessoas. A ideia foi descartada e registrada no roadmap:

- **Saldos errados:** os saldos de Pessoas contariam uma compra pendente como dívida com a loja.
- **Lista poluída:** as lojas apareceriam em "Dividir com alguém".
- **Um campo só:** um lançamento não teria como ter loja e pessoa ao mesmo tempo (a compra no Mercado A dividida com a Ana).

## Opções consideradas

**Como guardar**

1. **Cadastro próprio do espaço**, escolhido como a pessoa: busca e "Adicionar 'Nome'". Cada estabelecimento existe uma vez, e a análise e a sugestão de categoria têm em que se apoiar.
2. **Texto livre no lançamento:** mais simples, mas "Mercado A", "mercado a" e "Merc. A" virariam três estabelecimentos, e a análise ficaria imprecisa.
3. **Subcategorias** (Mercado › Mercado A): mistura "o quê" com "onde". O mesmo mercado vende comida e limpeza, e o orçamento por categoria ficaria mais confuso.
4. **Etiquetas livres**, várias por lançamento: flexíveis, mas não respondem "onde" de forma única, e somar por etiqueta conta o mesmo gasto mais de uma vez.

**Onde vale**

1. **Saídas e entradas:** na saída, onde se comprou (Mercado A, Netflix); na entrada, quem pagou (Empresa X, iFood). Um cadastro e um campo.
2. **Só saídas:** deixaria sem resposta "de onde veio" uma entrada.

**O rótulo na tela**

1. **"Estabelecimento"** no formulário, na lista e na página do cadastro.
2. **"Onde?":** curto, mas estranho numa entrada ("Onde?" para um salário).
3. **"Loja" e "Empresa"**, conforme o tipo: dois termos para a mesma coisa.

## Decisão

Escolhidos com o dono do projeto: **cadastro próprio (opção 1)**, **saídas e entradas (opção 1)** e **"Estabelecimento" (opção 1)**. No código, `Merchant`, o termo do mercado ([ADR 0051](0051-vocabulario-da-interface.md)).

**Dados**

- **Tabela `merchants`** (RLS, [ADR 0028](0028-row-level-security.md)): `id`, `workspace_id`, `name`, `archived_at`, `created_at`, `updated_at`.
- **Nome único no espaço,** ignorando maiúsculas e acentos (`normalizeName`, como em Pessoas): "Adicionar 'Mercado A'" com um "mercado a" já cadastrado usa o existente.
- **Sem tipo:** o mesmo estabelecimento serve a saídas e entradas (a loja que vende e também devolve um valor).
- **Sem categoria fixa:** o mesmo mercado vende coisas de categorias diferentes. A sugestão de categoria virá do histórico, num passo próprio.
- **`merchant_id` opcional** em `transactions`, `recurrences` e `installment_plans`, com chave estrangeira composta para o estabelecimento do mesmo espaço, como `person_id` ([ADR 0029](0029-lancamentos-e-integridade-no-banco.md)).

**Regras**

- **Recorrências e parcelamentos:**
  - cada mês gerado e cada parcela herdam o estabelecimento;
  - mudar o estabelecimento de uma recorrência alcança os pendentes deste mês em diante, como os outros campos ([ADR 0038](0038-recorrencias-e-parcelamentos.md)).
- **Partes de uma divisão** não herdam o estabelecimento: a parte da Ana é um valor a receber dela, não uma compra no mercado.
- **Pessoa e estabelecimento convivem:** a compra no Mercado A dividida com a Ana tem os dois.
- **Arquivar em vez de excluir:**
  - o estabelecimento precisa estar ativo para ser escolhido;
  - um arquivado continua nos lançamentos antigos;
  - só se exclui um arquivado que nenhum lançamento, recorrência ou parcelamento usa (`MERCHANT_IN_USE`), como em Pessoas e Categorias.
- **Exportação de dados:** a tabela e os campos `merchantId` entram no arquivo ([ADR 0041](0041-termos-exportacao-e-exclusao-de-conta.md)).

**Tela**

- **No formulário:**
  - "Estabelecimento (opcional)", em "Mais opções", junto de observações e pessoa;
  - o seletor é o mesmo componente do de pessoa (busca sem acentos, folha no celular, popover a partir de md, "Adicionar 'Nome'"), sem os grupos de membros.
- **Na linha do lançamento:** o nome aparece nos detalhes, e a busca de Lançamentos também procura por ele.
- **Página "Estabelecimentos"** (no Mais): listar, renomear, arquivar, reativar e excluir os arquivados sem uso.

## Consequências

- **Mais um campo** no formulário, guardado em "Mais opções" para o caminho comum continuar curto ([ADR 0036](0036-design-mobile-first.md)).
  - Rever depois de algumas semanas de uso: se for preenchido quase sempre, sobe para fora de "Mais opções".
- **O seletor de pessoa** é generalizado para servir aos dois cadastros.
- **Passos, um por PR:**
  1. Docs: este ADR, glossário, modelo e roadmap.
  2. API:
     - a tabela, as rotas `/workspaces/:workspaceId/merchants`;
     - `merchantId` em lançamentos, recorrências e parcelamentos;
     - a exportação, o isolamento entre espaços e o RLS.
  3. Tela: o seletor no formulário, o nome na linha do lançamento e a busca.
  4. Tela: a página Estabelecimentos.
  5. Análise por estabelecimento dentro de uma categoria (quanto foi para cada mercado).
  6. Coluna opcional "Estabelecimento" na planilha modelo, criando os novos na importação.
  7. Sugerir a categoria pelo estabelecimento, junto com a sugestão pela descrição.

## Nota de 2026-10-13: a sugestão de categoria

Decidido com o dono do projeto, no passo 7:

- **De onde vem:** do histórico do espaço nos últimos 12 meses, do mesmo tipo. Primeiro a categoria mais usada com o estabelecimento; sem ele, a mais usada com a mesma descrição, ignorando maiúsculas, acentos e espaços. As partes de uma divisão ficam de fora.
- **Como chega:** `GET /workspaces/:workspaceId/categories/hints` manda as dicas de uma vez (até 500 descrições, as mais usadas). O formulário consulta enquanto a pessoa digita, sem uma requisição por letra. Só saem nomes e ids, nunca valores.
- **Como aparece:** num lançamento novo, a categoria **vazia** é preenchida, com a nota "Sugerida pelo histórico". A sugestão só troca o que ela mesma preencheu; uma categoria escolhida à mão nunca muda. Não vale na edição nem no "Guardar" do Painel.
- **O estabelecimento não é sugerido:** continua escolhido à mão.
- **Na prática, a descrição é quem mais sugere:** o estabelecimento fica em "Mais opções", abaixo da categoria.

## Nota de 2026-10-18: o estabelecimento na edição de recorrências e parcelamentos

Um teste do dono mostrou que a edição em Recorrências não mostrava o estabelecimento, embora a API já o aceitasse desde o passo 1. Agora:

- **Os dois formulários de edição** (recorrência e parcelamento) têm "Estabelecimento (opcional)", com o mesmo `MerchantSelect` do lançamento: a busca pelo apelido e "Adicionar 'Nome'", que cria o estabelecimento ao salvar.
- **Só vai quando muda,** como os outros campos: o novo alcança os lançamentos pendentes deste mês em diante (recorrência) ou as parcelas pendentes (parcelamento); "Nenhum" desliga.
- **O atual fica como está,** mesmo arquivado: aparece no campo e não é reativado nem reenviado enquanto a pessoa não escolhe outro.
