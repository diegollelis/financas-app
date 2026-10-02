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
