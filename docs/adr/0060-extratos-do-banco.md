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

## Nota (o que o desfazer muda e "Remover do histórico", 2026-10-24)

Com várias importações no histórico, "Desfazer" uma antiga podia apagar mais do que parecia. A confirmação dizia que os lançamentos editados ou pagos saíam junto, mas não o que tinha sido construído sobre eles.

- **A lista de importações traz o que depende de cada uma** (`dependents`):
  - lançamentos que viraram meses de recorrência, que não voltam depois de desfazer;
  - lançamentos divididos, cujas partes ficam soltas;
  - lançamentos que viraram parcelados, cujas outras parcelas ficam;
  - o último mês dos parcelamentos que a importação criou, que saem inteiros.
- **A confirmação do "Desfazer"** lista o que não for zero, sob "Também muda".
- **"Remover do histórico"** (`DELETE …/imports/:id?keepTransactions=true`): a importação sai da lista, e os lançamentos e parcelamentos dela ficam como estão, como se lançados à mão. Só não é mais possível desfazê-la de uma vez. Numa transação com o contexto de RLS, o vínculo é solto e depois a importação é apagada.
- **As duas ações ficam num menu ⋯** em cada importação, cada uma com a sua confirmação.

O "Desfazer" continua permitido com dependências. A confirmação mostra o que muda, e quem só quer limpar o histórico usa a outra ação.

## Nota (a revisão como uma etapa, 2026-10-25)

A revisão aparecia no lugar da escolha do arquivo sem dizer o que estava acontecendo: o endereço não mudava, as abas e o histórico sumiam, e restava um "3. Revise e importe" solto. O voltar do celular saía da página e perdia as escolhas sem aviso, e a única saída era "Escolher outro arquivo". Um modal não serve aqui: a revisão é longa, cada linha abre o seu próprio diálogo, e fechá-lo sem querer perderia tudo. Por isso, a revisão continua em tela inteira e ganha cara de etapa:

- **O topo da etapa:**
  - um título ("Revisar fatura do cartão", "Revisar extrato da conta", "Revisar planilha");
  - o que está sendo revisado ("Nubank · 50 linhas"). O nome do arquivo não aparece, porque o do extrato da conta traz o número da conta;
  - o indicador "Arquivo → Revisão → Importado" (`StepIndicator`, `components/step-indicator.tsx`);
  - **"Cancelar",** um botão em contorno pequeno, como os outros botões de topo do app.
  - As abas ficam escondidas durante a revisão, e o cartão de números passa a se chamar "Resumo".
- **No celular,** o topo rola com a página. Uma faixa fixa com o título e "Cancelar" chegou a ser feita, mas foi tirada logo depois: tirava espaço da lista para uma ação rara, e sair sem querer já pergunta antes. Um botão flutuante de cancelar também foi descartado: disputaria espaço com a ação principal, e os guias de interface reservam o botão flutuante para a ação positiva.
- **Cancelar:** sem nada mudado, volta direto para a escolha do arquivo. Com alguma linha alterada, pergunta antes, no diálogo de confirmação do app: "Descartar a revisão?", com "Descartar revisão" e "Continuar revisando" (e não "Cancelar", para não haver dois "Cancelar" com sentidos opostos).
- **Sair sem querer:** com alguma linha alterada, trocar de seção ou voltar pergunta "Sair da revisão?" (`useBlocker` do React Router). Fechar ou recarregar a aba mostra o aviso padrão do navegador (`beforeunload`). Depois de importar, a ida para Lançamentos não pergunta nada.
- **O endereço continua o mesmo.** Um endereço próprio para a revisão faria o voltar do navegador perder o arquivo, que só existe na memória do navegador.
- **O botão de importar no celular (2026-10-25):** ele continua sendo a pílula flutuante do app, acima da barra de abas, como em "Novo lançamento". Uma barra encaixada, com a barra de abas escondida, foi considerada e descartada, por mudar a cara do app. Mas o botão deixou de ficar translúcido quando desabilitado: o texto dos cartões aparecia através dele. Agora, desabilitado, ele tem fundo sólido em cinza (em `PageActionButton`, para todas as páginas). E, enquanto algo impede a importação, ele diz o que falta e leva até lá: "Informe o vencimento da fatura" (o campo), "Marque ao menos uma linha" ("Marcar todas") ou "Complete as linhas marcadas" (a primeira linha com problema). O texto antigo, "Importar 0 lançamentos", parecia um defeito.
