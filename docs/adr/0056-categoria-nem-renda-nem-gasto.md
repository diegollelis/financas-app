# 0056 — Categoria "Nem renda nem gasto": empréstimos fora da renda e do limite de gastos

- **Status:** Aceita
- **Data:** 2026-10-22

## Contexto

O dono lançou dois empréstimos pessoais numa categoria própria ("Empréstimo pessoal"):

- um empréstimo novo, como saída dividida 100% com a pessoa, o que gera a saída e a parte a receber (Reembolso);
- a devolução de um empréstimo antigo, só como entrada, porque a saída original nunca foi registrada no app.

O painel tratava toda entrada como renda e toda saída fora das metas como gasto (ADRs 0031, 0047). Com isso:

- **A devolução inflava "Entradas do mês"** (comparadas com a renda líquida, nota no ADR 0046) e o atalho "Usar as entradas do mês" do orçamento.
- **O empréstimo feito comia o limite de gastos** e aparecia no ranking de gastos da Análise, embora emprestar não seja consumir.

O dono observou que o dinheiro emprestado sai de fato no mês. Por isso ele não pode simplesmente sumir das contas: ele reduz o que dá para guardar.

## Opções consideradas

1. **Não mudar nada** — sem trabalho, mas o painel continua dizendo que a renda e os gastos são o que não são.
2. **Toda entrada com "A receber de" deixa de ser renda** — sem mudança no banco, mas é uma adivinhação: não resolve a saída do empréstimo e erra com quem recebe de uma pessoa por um serviço.
3. **Uma marca na categoria que a tira de tudo, inclusive da sobra para guardar** — simples, mas as metas ignorariam um dinheiro que saiu, e o mês pediria para guardar o que a pessoa não tem.
4. **Uma marca na categoria que a tira da renda e dos gastos, mas a mantém no saldo e na sobra para guardar** — o limite de gastos mede consumo, e as metas medem o dinheiro que sobra de fato.

## Decisão

Opção 4, com o nome **"Nem renda nem gasto"**, escolhido numa prévia entre "Fora do orçamento" (engana, porque a sobra das metas faz parte do orçamento) e "Movimentação" (não diz o que acontece com os números).

- **No banco:** `categories.neutral` (booleano, falso por padrão). `PATCH …/categories/:id { neutral }` marca e desmarca. Uma categoria de meta (`CATEGORY_OF_DESTINATION`) e Reembolso/Repasse (`CATEGORY_OF_SPLIT`) não aceitam a marca. A lista devolve `neutral`, a cópia entre espaços (ADR 0048) leva a marca junto, e a exportação de dados (ADR 0041) também.
- **No painel** (`summarizePeriod`, que recebe as categorias marcadas, arquivadas inclusive):
  - uma saída marcada não é gasto (`expenses`, limite de gastos);
  - uma entrada marcada não entra em `incomeCents` e é somada à parte em `neutralIncomeCents`, que o cartão do orçamento mostra ("Mais R$ 3.000,00 fora da renda", numa linha própria embaixo da comparação com a renda);
  - a sobra para guardar (`available`) continua sendo o que entrou menos o que saiu: a saída marcada é descontada dela, e a entrada marcada, somada (a entrada deixou de ser somada: ver a nota de 2026-10-22);
  - o saldo do mês e o saldo atual não mudam.
- **Na Análise:** as saídas marcadas saem dos gastos (`neutralCents` em `MonthlyPoint` e em `seriesTotals`) e dos rankings de gastos por categoria e por meio de pagamento, como as aplicações nas metas (ADR 0047). As entradas marcadas continuam em "Entradas", que na Análise é o dinheiro que entrou.
- **Na tela:**
  - **Em Categorias:** o selo "Nem renda nem gasto" e, no menu ⋯, "Não contar como renda nem gasto". Antes de marcar, uma janela explica o que muda e avisa que vale para todos os meses, inclusive os passados. Para desmarcar, o menu oferece "Contar como gasto" ou "Contar como renda", sem pergunta.
  - **No formulário de lançamento:** nada muda, porque a marca vem da categoria.

## Consequências

- **A marca vale para todos os meses,** porque o painel é calculado a cada leitura (ADR 0031) e nada fica guardado. Marcar ou desmarcar muda também os meses passados, e a janela de confirmação avisa disso.
- **O empréstimo novo, dividido 100% com a pessoa,** sai do limite de gastos. No previsto, a sobra não muda, porque a parte a receber (Reembolso) devolve o valor. No realizado, a sobra fica menor até a pessoa pagar.
- **Um empréstimo que você tomou** (entrada agora, saídas depois para pagar) segue a mesma regra, se a categoria for marcada.
- **Uma regra nova sobre saídas ou entradas** precisa decidir o que fazer com as categorias marcadas, como já acontece com as categorias das metas.

## Nota (a devolução não vira meta, 2026-10-22)

Em produção, a devolução de um empréstimo antigo, de valor alto, entrou na sobra para guardar, como esta decisão previa. Cada meta virou um percentual desse valor, e o painel passou a pedir para guardar dezenas de milhares de reais num mês comum.

- **Entradas marcadas saem da sobra para guardar** e ficam só no saldo. As metas dividem o que a renda do mês deixa livre, e dinheiro que volta (ou que se pegou emprestado) não é renda nova. Quem quiser guardá-lo usa "Guardar" na meta.
- **Saídas marcadas continuam diminuindo a sobra:** o dinheiro saiu, e há menos para guardar.
- **O custo:** um empréstimo devolvido como entrada comum na categoria marcada não devolve a sobra que o empréstimo tirou. Na divisão de 100% (a forma recomendada para um empréstimo novo), a parte da pessoa fica em Reembolso, que não é marcada, então a sobra prevista se compensa no próprio mês.
- **Um empréstimo tomado** segue a mesma regra: o dinheiro emprestado não vira meta, e as parcelas pagas diminuem a sobra dos meses em que saem.
