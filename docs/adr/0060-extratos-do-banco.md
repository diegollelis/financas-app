# 0060 — Extratos do banco: páginas, banco e tipo de cada importação

- **Status:** Aceita
- **Data:** 2026-10-24

## Contexto

A tela "Importar" nasceu para a planilha modelo ([ADR 0040](0040-importacao-da-planilha.md)) e ganhou a fatura do cartão do Nubank ([ADR 0055](0055-importacao-da-fatura-do-cartao.md)). As duas origens e o histórico das duas ficavam numa página só, escolhidas por "De onde vêm os lançamentos?".

O dono quer importar também o **extrato da conta**, para que tudo o que passa pelo banco seja importado e conferido. Com um terceiro tipo, a página ficaria carregada. Além disso:

- **cada banco tem o seu formato,** e um dia outros bancos podem entrar;
- **o histórico não sabia o tipo de cada importação:** usava a "Origem" digitada (texto livre) e a presença do vencimento da fatura.

## Opções consideradas

1. **Manter uma página só, com mais uma opção:** é o mais simples, mas fica carregada, e o histórico continua misturado.
2. **Dois itens em "Mais"** ("Importar planilha" e "Importar extrato"): fica claro, mas o menu já tem seis itens.
3. **Um item "Importar" com duas páginas próprias,** escolhidas no topo, e o banco e o tipo guardados em cada importação.

## Decisão

Opção 3.

- **Duas páginas,** com abas no topo (`ImportHeader`, `features/import/import-tabs.tsx`). As abas são links com o visual do controle segmentado, e cada página tem o seu endereço:
  - **Extrato do banco** (`/importar/extrato`, a padrão): primeiro o **banco**, depois **"Qual extrato?"**, depois o arquivo. O histórico, "Extratos importados", mostra só os extratos.
  - **Planilha modelo** (`/importar/planilha`): os passos de antes. O histórico, "Planilhas importadas", mostra só as planilhas.
  - O antigo `/importar` abre o extrato, e "Importar" fica marcado no menu nas duas páginas.
- **O tipo e o banco de cada importação:**
  - `imports.kind` (`TEMPLATE`, `CARD_STATEMENT`, `ACCOUNT_STATEMENT`) e `imports.bank` (`NUBANK`), com um CHECK no banco de dados: a planilha não tem banco, e um extrato sempre tem.
  - A migração classificou as importações antigas: as que têm vencimento de fatura são faturas do Nubank.
  - A API recebe e devolve os dois campos, e a exportação de dados também. Um cliente antigo, que não manda o tipo, é lido como antes: fatura do Nubank quando tem vencimento, planilha quando não tem.
- **Uma lista de bancos e tipos** (`statementBanks` em `packages/shared/src/statement-sources.ts`): cada banco diz os extratos que oferece, e cada extrato traz o rótulo, se já está disponível e as colunas do cabeçalho.
  - A tela é montada a partir dessa lista. Acrescentar um banco, ou um tipo dele, é acrescentar um item, o leitor e os testes, sempre com linhas inventadas ([ADR 0019](0019-repositorio-publico.md)).
  - `detectStatement` reconhece o arquivo pelo cabeçalho. Um arquivo de outro tipo recebe "Este arquivo parece o extrato de conta do Nubank" em vez de um erro genérico.
  - Por enquanto, só o Nubank. A conta aparece desabilitada, com "chega no próximo passo".

## Consequências

- **O extrato da conta** entra como mais um tipo do Nubank, com o seu leitor, as regras da revisão e a **conferência** com o que já está lançado (casar com o pendente e quitar, avisar valor diferente, reconhecer dinheiro entre as suas contas e caixinhas). Ele será registrado numa nota aqui ou num ADR próprio. A análise de um extrato real mostrou que só ler e criar lançamentos duplicaria quase tudo.
- **Outros bancos** entram pela lista. Um leitor de **OFX**, o formato que muitos bancos brasileiros exportam para a conta, poderia cobrir vários de uma vez, como "Outro banco (OFX)".
- **O identificador de cada movimento,** que o extrato da conta traz, será guardado com o banco ("NUBANK:<código>"), para nunca colidir entre bancos.
