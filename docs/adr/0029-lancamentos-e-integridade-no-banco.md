# 0029 — Lançamentos: regras garantidas pelo banco e status derivado

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

O lançamento (`Transaction`) é o centro do app. O [modelo](../dominio/modelo.md#transaction-lançamento) traz regras que, se furadas, corrompem os totais do painel:

- a categoria é do **mesmo espaço** e do **mesmo tipo** do lançamento (um débito numa categoria de crédito distorce os indicadores);
- o valor é **positivo** e a competência é um `YYYY-MM` real ([ADR 0010](0010-dinheiro-e-datas.md));
- uma categoria **em uso não é excluída**, só arquivada.

Validar só no serviço deixa as regras à mercê de cada código novo: uma importação, um script de correção ou um serviço futuro que esqueça a checagem. No Protheus, seria confiar só no `X3_VALID` de uma tela, sem nada no dicionário que impeça a gravação por outra rotina.

Também era preciso decidir se o status (pendente, vencido, efetivado) é gravado ou calculado.

## Opções consideradas

1. **Regras só no serviço**: simples, mas qualquer caminho que pule o serviço grava dado inválido.
2. **Gatilho (trigger) no banco**: garante as regras, mas é código procedural escondido do Prisma e dos testes de unidade.
3. **Restrições declarativas**: chave estrangeira composta e `CHECK`. O banco garante as regras sem código procedural, e o serviço continua validando para dar mensagens claras.

Para o status: **coluna `status` gravada** (precisa ser atualizada todo dia para virar "vencido") ou **status derivado** de `settled_at` e `due_date`.

## Decisão

**Opção 3, e status derivado.**

- **Chave estrangeira composta:** o lançamento aponta para a categoria por `(category_id, workspace_id, type)` → `categories(id, workspace_id, type)`, com um índice único nesse trio. Se a categoria for de outro espaço ou do outro tipo, a linha não existe para o banco, e a gravação é recusada.
- **`ON DELETE NO ACTION`** nessa chave: excluir uma categoria com lançamentos falha, e a API responde `409 CATEGORY_IN_USE` ("só arquivar"). `NO ACTION` é verificado no fim do comando, e não na hora como `RESTRICT`. Assim, excluir um espaço continua apagando, em cascata e de uma vez, as categorias e os lançamentos dele.
- **`CHECK`s escritos à mão na migração:** `amount_cents > 0` e `period ~ '^\d{4}-(0[1-9]|1[0-2])$'`.
- **O serviço valida antes**, para responder `400 INVALID_CATEGORY` com mensagem em pt-BR. Ele também recusa categoria **arquivada** em lançamento novo, ou quando a categoria é trocada. Um lançamento antigo pode manter a categoria que foi arquivada depois. Essa regra é só do serviço, porque depende do momento da escolha.
- **Status derivado, nunca gravado:** **efetivado** = `settled_at` preenchido; **vencido** = pendente com `due_date` anterior a hoje; **pendente** = o resto. "Hoje" é o do usuário (fuso `America/Sao_Paulo`), então o cálculo fica no front, numa função de `packages/shared`.
- **`due_date` é opcional.** Gastos como "Mercado" não têm vencimento, e sem ele o lançamento nunca fica vencido.
- **Efetivar em um clique** é um `PATCH { settledAt: "<hoje>" }`, e desfazer é `{ settledAt: null }`. Não há rota própria.
- A API recebe e devolve datas como `YYYY-MM-DD` (coluna `DATE`, sem fuso), e valores em centavos inteiros.

## Consequências

- Os testes provam as regras **no próprio banco**, gravando direto com o Prisma, sem passar pelo serviço.
- Trocar o tipo de um lançamento exige trocar a categoria junto. A interface deve oferecer só categorias do tipo escolhido.
- Os `CHECK`s e a política de RLS ficam em SQL escrito à mão. O Prisma não os gerencia. A garantia de que continuam aplicáveis é o CI, que aplica todas as migrações num banco vazio a cada execução.
- Parcelamentos e recorrências (fase 5) vão gerar lançamentos comuns e herdam essas regras.

## Nota (o tipo de um lançamento ligado a outros, 2026-10-20)

Trocar entrada por saída, ou o contrário, deixava a série ou a divisão incoerente. Uma parte de divisão fica do lado oposto ao lançamento dividido, e um mês de recorrência ou uma parcela tem o tipo da série. Por isso, o `PATCH …/transactions/:id` recusa a troca de tipo (409 `TYPE_LOCKED`, com o motivo) em:

- **uma parte de divisão;**
- **um lançamento dividido;**
- **um mês de recorrência;**
- **uma parcela.**

Mandar o mesmo tipo de novo não é troca e passa. Um lançamento avulso e não dividido continua podendo trocar de tipo, com a categoria junto. A revisão da importação continua com o tipo editável, porque ali nada foi gravado ainda.

**Na tela:** ao editar um lançamento, "Saída | Entrada" continua no lugar de sempre. O tipo dele fica marcado, o outro aparece desativado, e uma frase embaixo diz o motivo: "O tipo não muda depois de lançado. Para trocar, exclua e lance de novo." A tela trava o tipo em toda edição, também num lançamento avulso que a API ainda aceitaria trocar, para a regra ser uma só para quem usa. O leitor de tela anuncia a frase com o grupo, e as setas do teclado pulam a opção desativada.

## Nota (o dia do pagamento no formulário, 2026-10-21)

A API sempre aceitou qualquer dia em `settledAt`, ao criar e ao editar, mas a tela só gravava o de hoje: "○ Pagar" / "○ Receber" e "Marcar como pago" marcam hoje, e o formulário não tinha o campo. Uma conta paga na sexta e marcada na segunda ficava com a data de segunda, sem como corrigir.

- **O formulário ganha "Pago em" / "Recebido em"** (`settledOnLabels`, em `packages/shared/src/labels.ts`), logo depois do vencimento: em branco enquanto pendente; preenchido, pago ou recebido naquele dia. Aparece num lançamento novo feito uma vez e em qualquer lançamento editado. Uma recorrência ou um parcelamento novo começa pendente, e seus meses são pagos um a um.
- **Ao editar, vem o dia gravado,** e dá para corrigir. Apagar o dia volta a deixar pendente, como "Desmarcar pagamento".
- **Nunca no futuro:** pago é o que já aconteceu ("O pagamento não pode ser numa data futura."); o que ainda vai acontecer é o vencimento. A regra fica no formulário.
- **O botão da linha continua marcando hoje com um toque,** o caso mais comum. Um item "Pago em outra data…" no menu ficou de fora: o formulário resolve os três casos (corrigir, pagar com data passada, lançar já pago) num lugar só, e o item pode vir depois, se fizer falta.
- O dia do pagamento não muda a competência nem os números do Painel e da Análise, que dependem só de estar pago ou não.

## Nota (observações em várias linhas, 2026-10-22)

O banco sempre guardou até 1.000 caracteres nas observações (`transactions.notes`), mas o campo era de uma linha só, e uma observação mais longa não cabia de forma legível. Em vez de um campo "Notas" a mais, que teria o mesmo papel e faria a pessoa escolher onde escrever, o próprio campo "Observações" passa a ter várias linhas:

- **Para escrever** (`NotesTextarea`, `components/notes-textarea.tsx`): começa com 2 linhas e cresce com o texto até umas 8, depois rola; Enter quebra a linha. Um contador aparece só perto do limite ("950 de 1.000"), que o campo não deixa passar. Vale no formulário de lançamento, na edição de recorrência e de parcelamento e no "Editar" da linha da importação.
- **Para ler** (`NotesText`, `components/notes-text.tsx`): com as quebras de linha, até 2 linhas no cartão de Lançamentos e 1 na tabela, com "…". Só quando há mais aparece "Ver tudo", que abre o texto inteiro no próprio lugar ("Ver menos" fecha), sem abrir o formulário: ler não é editar. O botão tem a cor do texto, sublinhado (o azul não tinha contraste nas listras da tabela no tema escuro), e 44 px de toque no celular.
- Sem mudança na API nem no banco: os 1.000 caracteres continuam, e a busca já procurava nas observações.

## Nota (a janela de leitura das observações, 2026-10-22)

O "Ver tudo" das observações abria o texto no próprio cartão ("Ver menos" fechava), e uma observação longa aumentava o cartão ou a linha da tabela, empurrando a lista. Agora ele abre uma **janela só de leitura** (`ResponsiveDialog`: folha de baixo no celular, diálogo no computador), com o título "Observações", a descrição do lançamento embaixo e o texto inteiro, com as quebras de linha, rolando dentro dela quando passa da altura. "Ver menos" deixou de existir.

- **A lista nunca cresce nem pula:** o cartão continua com 2 linhas, e a tabela, com 1.
- **O botão diz de qual lançamento é** ("Ver tudo: observações de Compra do mês"), porque uma lista tem vários; começa pelo texto que aparece (WCAG 2.5.3). Ao fechar, o foco volta a ele.
- **Fecha pelo X da janela** (chamado "Fechar"), por Esc ou por um toque fora. Não há um segundo botão "Fechar", que repetiria o nome.
- **Só leitura:** a janela não edita; o menu ⋯ do lançamento continua ao lado.
