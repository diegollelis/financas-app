# 0042 — Pessoas, valores a receber e a pagar, e rateio de lançamentos

- **Status:** Aceita
- **Data:** 2026-10-08

## Contexto

Na planilha original, o dono registrava "valor dividido com…" e "a receber de…" só no texto da descrição ([planilha-origem.md](../dominio/planilha-origem.md), problema 6). O modelo de domínio deixou o rateio "a decidir em ADR próprio".

Casos que o dono do projeto descreveu e aprovou com exemplos:

- **Você pagou e alguém te deve:** um jantar de R$ 300 no seu cartão, metade é da Ana.
- **Alguém pagou e você deve:** a Ana pagou a casa de praia, e a sua parte é R$ 400.
- **Divisão entre várias pessoas:** uma hospedagem dividida em três.
- **Com quem divide:** quase sempre com quem **não usa o app**, mas às vezes com quem usa, ou com um membro do mesmo espaço.
- **A divisão das contas da casa por percentual de renda entre membros** é outra função, com ADR próprio, depois desta.

## Opções consideradas

**Quem é a outra pessoa**

1. **Só membros do espaço:** quem não usa o app ficaria de fora, e esse é o caso mais comum.
2. **Contatos do espaço, só um nome**, com a opção de ligar a um membro: serve para todos.
3. **Contatos ligados a contas de outros espaços, com sincronização:** a Ana veria e mudaria o lançamento no app dela. Isso exige notificações, aceite e regras de conflito para edições e exclusões dos dois lados.

**O que acontece com a parte da outra pessoa**

1. **Só reduzir o seu gasto:** o lançamento conta só a sua parte. Ninguém acompanha quem deve.
2. **Virar um valor a receber:** o gasto fica inteiro, porque foi o que saiu do seu bolso, e um crédito pendente "a receber de Ana" fica ligado a ele.
3. **As duas coisas:** contaria a parte da Ana duas vezes, como redução do gasto e como crédito a receber.

**Categoria do valor a receber**

1. **Uma categoria "Reembolso",** criada em todos os espaços.
2. **Escolher a cada divisão:** um campo a mais toda vez.
3. **A mesma categoria do gasto, como crédito:** duplica a lista de categorias.

## Decisão

Escolhidos com o dono do projeto: **contatos por nome (opção 2)**, **valor a receber (opção 2)** e **categoria "Reembolso" (opção 1)**.

**Pessoas** (`people`, tabela com RLS)

- **Uma pessoa é um contato do espaço:** nome obrigatório, até 100 caracteres, único no espaço sem diferenciar maiúsculas.
- **Ligação a um membro:** opcionalmente, a pessoa liga a um membro do mesmo espaço (`member_user_id`), e o nome mostrado passa a ser o da conta. Se o membro sair, a pessoa fica como contato, só com o nome (`SET NULL`).
- **Arquivar ou excluir:** uma pessoa com lançamentos não é excluída, só arquivada, como as categorias. Sem lançamentos, pode ser excluída.
- **Rotas:** `/workspaces/:workspaceId/people` lista, cria, renomeia ou arquiva, e exclui. A lista traz, por pessoa, o total pendente a receber e a pagar.

**Lançamento ligado a uma pessoa**

- **O campo:** `transactions.person_id`, opcional, com chave estrangeira composta para a pessoa do mesmo espaço, como a categoria ([ADR 0029](0029-lancamentos-e-integridade-no-banco.md)).
- **O sentido vem do tipo:** um crédito é "a receber de", e um débito é "a pagar para". Nada novo no saldo: ele já é um lançamento comum, e o Painel e a Análise o tratam como qualquer outro.

**Dividir um gasto**

- **Onde:** só no débito. No novo lançamento, "Dividir com alguém" recebe uma ou mais pessoas, existentes ou novas, e a parte de cada uma, em valor ou percentual.
- **O que é criado,** numa escrita só, tudo ou nada:
  - o débito inteiro;
  - um crédito pendente por pessoa: "Ana: parte de {descrição}", na categoria "Reembolso", na mesma competência, ligado à pessoa e ao débito (`transactions.split_of_id`).
- **O centavo que sobra** de uma divisão em partes iguais fica na sua parte, a mesma regra de `splitInstallments`.
- **A soma das partes dos outros** não passa do valor do gasto. A sua parte pode ser zero, quando você pagou só pelos outros.
- **Os lançamentos são independentes depois de criados:** mudar o débito não muda as partes. Excluir o débito pergunta se exclui também os créditos ligados; se não, eles ficam, e a ligação é desfeita (`SET NULL`).
- **"Reembolso"** entra nas categorias padrão de crédito. Uma migração a cria nos espaços que ainda não a têm. Se a pessoa arquivou ou excluiu a categoria, a divisão a reativa ou cria de novo.

**Tela**

- **No novo lançamento,** "Dividir com alguém" mostra a sua parte em reais enquanto você digita. No lançamento avulso, há também o campo "Pessoa".
- **Nos lançamentos ligados,** aparecem selos como "Dividido com Ana", "A receber de Ana" e "A pagar para Ana".
- **A página "Pessoas", em Mais:** o que cada pessoa deve a você e o que você deve a ela, o saldo, e os lançamentos dela de qualquer mês.

**Fica para depois, cada um com ADR próprio**

- **"Enviar para Ana":** para uma pessoa cadastrada com e-mail que usa o app, um pedido que ela aceita e registra no espaço dela, sem sincronização automática entre os dois lados.
- **Divisão das contas da casa por percentual** entre os membros de um espaço.

**Privacidade: ninguém enxerga ninguém fora de um espaço compartilhado**

- **Uma pessoa é um contato digitado, não uma busca de usuários.** O app não tem diretório de quem o usa e nunca diz se um nome ou e-mail tem conta. Cadastrar "Ana" não liga a nenhuma conta, e a Ana não fica sabendo.
- **A ligação a um membro só lista os membros daquele espaço** (ADR [0027](0027-convites-por-email.md)): gente que entrou por convite aceito. No espaço pessoal, a lista é vazia.
- **As pessoas e os lançamentos ligados a elas ficam no espaço onde foram criados,** sob a mesma RLS das outras tabelas de negócio ([ADR 0028](0028-row-level-security.md)). Só os membros desse espaço os veem.
- **O futuro "Enviar para Ana" segue as mesmas regras:**
  - a resposta é a mesma para qualquer e-mail, como no cadastro ([ADR 0022](0022-envio-de-email.md));
  - quem recebe decide se registra, e em qual espaço;
  - cada lado fica só com o próprio lançamento, sem ver os dados do outro.

## Consequências

- O que estava escondido no texto da descrição passa a ter dono, valor e status: dá para saber, por pessoa, quanto falta receber.
- **O gasto conta inteiro:** o débito entra no orçamento e na Análise pelo valor total, e o que volta aparece em "Reembolso". O resultado do mês é o mesmo, mas o gasto da categoria parece maior que a sua parte. Se isso incomodar, uma opção de "contar só a minha parte" pode vir depois.
- **Ficam fora desta etapa:**
  - pagamento parcial de uma parte (por enquanto, edita-se o valor);
  - dividir um lançamento que já existe;
  - dividir recorrências e parcelamentos;
  - a coluna "Pessoa" na planilha modelo.
- **Duas tabelas mudam:** `people` é nova, e `transactions` ganha dois campos.
  - A exportação de dados ([ADR 0041](0041-termos-exportacao-e-exclusao-de-conta.md)) inclui as pessoas, e o teste de cobertura dela exige isso.
  - `people` tem `workspace_id`, então entra no teste de RLS.
- **A entrega se divide em dois PRs:** a API (pessoas, ligação, divisão, Reembolso) e a tela.
