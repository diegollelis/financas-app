# 0054 — Meio de pagamento: como se pagou ou recebeu

- **Status:** Aceita
- **Data:** 2026-10-14

## Contexto

Um lançamento diz **o quê** (a categoria), **com quem** (a pessoa, [ADR 0042](0042-pessoas-e-rateio.md)) e **onde** (o estabelecimento, [ADR 0053](0053-estabelecimentos.md)). Lançando no dia a dia, o dono do projeto sentiu falta de dizer **como**: no Pix, no débito, no crédito, em dinheiro. Com isso dá para responder "quanto foi no crédito este mês?" ou "quanto saiu em dinheiro?".

"Forma de pagamento" pode querer dizer duas coisas:

1. **O meio** (Pix, débito, crédito…): um atributo do lançamento.
2. **A conta ou o cartão** ("Nubank crédito", "Conta Itaú"): o que os apps do mercado chamam de Contas e Cartões, com saldo por conta e fatura por cartão. É uma mudança grande no domínio (saldo por conta, transferências, a fatura agrupando as compras, o parcelado dentro dela).

O dono escolheu **o meio**. Contas e cartões ficam para depois, num ADR próprio, se a necessidade aparecer.

Hoje a categoria padrão **"Cartão de crédito"** faz as vezes de meio: uma compra no mercado feita no crédito vai para "Cartão de crédito", e o gasto com mercado fica dividido entre duas categorias.

## Opções consideradas

**Como guardar**

1. **Uma lista fixa** no código: nada a cadastrar nem manter, e somar por meio é seguro, porque cada um existe uma vez.
2. **Um cadastro do espaço,** como Estabelecimentos: permitiria nomes como "Nubank crédito", mas aí já é o começo de Contas e Cartões, sem o saldo e a fatura que dariam sentido a isso.
3. **Texto livre:** "Pix", "pix" e "PIX" virariam três meios.

**Quais meios**

1. **Sete:** Pix, Débito, Crédito, Dinheiro, Boleto, Transferência e Débito automático (contas debitadas sozinhas, como luz, água e assinaturas).
2. **Seis,** sem Débito automático.

**Onde vale**

1. **Saídas e entradas,** com o rótulo conforme o tipo: "Meio de pagamento" na saída, "Meio de recebimento" na entrada (o salário chega por transferência; a Ana devolve no Pix).
2. **Só saídas.**

## Decisão

Escolhidos com o dono do projeto: **lista fixa (opção 1)**, **sete meios (opção 1)** e **saídas e entradas (opção 1)**. No código, `PaymentMethod`.

**Dados**

- **Enum `payment_method`** no banco (`PIX`, `DEBIT_CARD`, `CREDIT_CARD`, `CASH`, `BOLETO`, `TRANSFER`, `AUTO_DEBIT`) e `z.enum` em `packages/shared`, com os rótulos da tela num lugar só (`paymentMethodLabels`, como os de tipo e situação, [ADR 0051](0051-vocabulario-da-interface.md)).
- **`payment_method` opcional** em `transactions`, `recurrences` e `installment_plans`.

**Regras**

- **Recorrências e parcelamentos:** cada mês gerado e cada parcela herdam o meio; mudar o meio de uma recorrência alcança os pendentes deste mês em diante, como os outros campos ([ADR 0038](0038-recorrencias-e-parcelamentos.md)).
- **Partes de uma divisão** não herdam o meio: a parte da Ana é um valor a receber dela, e como ela vai pagar ainda não se sabe.
- **Sugestão pelo histórico,** como a da categoria ([ADR 0053](0053-estabelecimentos.md)): num lançamento novo, um meio vazio vem preenchido com o mais usado com o estabelecimento e, sem ele, com a descrição, nos últimos 12 meses e no mesmo tipo; a tela diz "Sugerido pelo histórico", troca só o que ela mesma preencheu e nunca uma escolha feita à mão. A rota de dicas (`GET …/categories/hints`) passa a trazer também os meios.
- **Exportação de dados:** os campos entram no arquivo ([ADR 0041](0041-termos-exportacao-e-exclusao-de-conta.md)).

**"Cartão de crédito" deixa de ser categoria padrão**

- **Espaços novos** não a recebem mais: o crédito passa a ser o meio, e a compra fica na categoria do que se comprou.
- **Espaços existentes ficam como estão.** A categoria tem lançamentos, e apagá-la ou mudar os lançamentos de categoria sozinho mexeria nos dados de alguém. Quem quiser a arquiva em Categorias: ela continua nos lançamentos antigos e sai dos seletores.

**Tela**

- **No formulário:** "Meio de pagamento (opcional)" numa saída, "Meio de recebimento (opcional)" numa entrada, em "Mais opções", escolhido num `Select` com os sete meios e "Nenhum".
- **Na linha do lançamento:** o meio aparece nos detalhes; na tabela, embaixo do estabelecimento, na mesma coluna, que se chama "Estabelecimento / Meio" e mostra "—" sem estabelecimento (sem isso, um "Pix" sozinho parecia ser o estabelecimento). A busca também procura por ele.
- **Na edição de uma recorrência:** o mesmo campo.
- **Na Análise:** "Por meio de pagamento", quanto foi em cada meio no período.
- **Na planilha modelo:** a coluna opcional "Meio de pagamento", lida pelo rótulo, ignorando maiúsculas e acentos; um valor desconhecido vira um aviso na linha e o lançamento entra sem meio.

## Consequências

- **Mais um campo** em "Mais opções", que continua guardando o que não é do caminho comum ([ADR 0036](0036-design-mobile-first.md)).
- **Contas e Cartões continuam possíveis:** um cadastro de contas poderia, mais tarde, ganhar um meio e substituir este campo por uma referência, sem perder o que já foi lançado.
- **Passos, um por PR:**
  1. Docs: este ADR, glossário, modelo e roadmap.
  2. API: o enum, as colunas, os schemas, os serviços (herança nas recorrências e parcelamentos), a exportação; e "Cartão de crédito" fora das categorias padrão.
  3. Tela: o campo no formulário e na edição da recorrência, o meio na linha e na tabela, a busca.
  4. A sugestão pelo histórico, a Análise por meio e a coluna da planilha.

## Nota (o campo à vista e sugerido, 2026-10-15)

- **Sai de "Mais opções" e vem logo após o vencimento,** no formulário do lançamento e na edição da recorrência (depois de "Vence no"). Com a sugestão pelo histórico, o meio era preenchido dentro de uma seção fechada, sem que a pessoa visse; à vista, a sugestão ("Sugerido pelo histórico") é confirmada ou trocada na hora. O ADR 0053 já previa subir um campo de "Mais opções" que fosse preenchido quase sempre.
- **Continua opcional.** Muitas vezes o meio só se sabe ao pagar (a conta lançada antes do vencimento), as recorrências e os parcelamentos antigos geram meses sem meio, as partes de uma divisão ficam sem meio de propósito, e a planilha modelo não o exige. O vazio quer dizer "ainda não sei", e a Análise poderá mostrar quanto está sem meio. Pedir o meio ao tocar em "Pagar" só será considerado depois de algumas semanas de uso, se houver muitos lançamentos sem ele.

## Nota (Vale-alimentação/refeição, 2026-10-15)

- **Um oitavo meio, "Vale-alimentação/refeição"** (`MEAL_VOUCHER`), logo depois de "Crédito": o vale do empregador (VA, VR), também o que só é aceito nos estabelecimentos da própria empresa. O dono do projeto pensou em "Crédito próprio", mas o nome não dizia de quem era o crédito; o termo do mercado diz.
- **Para o mês fechar certo,** o crédito mensal do vale entra como uma entrada, e as compras como saídas com esse meio; a Análise por meio mostrará quanto foi gasto no vale. Quanto ainda resta no cartão é saldo de conta, que fica com Contas e Cartões, se vierem.
- **Um valor a mais no enum** (`ALTER TYPE … ADD VALUE … AFTER 'CREDIT_CARD'`); o formulário, a sugestão, a busca e a tabela já usam a lista compartilhada.
