# 0052 — Pessoa e divisão em entradas, recorrências e parcelamentos

- **Status:** Aceita
- **Data:** 2026-10-12

## Contexto

O [ADR 0042](0042-pessoas-e-rateio.md) ligou lançamentos a pessoas e criou o "Dividir com alguém", com três limites:

- só um lançamento **avulso** liga uma pessoa ou é dividido;
- só uma **saída** é dividida;
- recorrências e parcelamentos ficaram para depois (roadmap: "Dividir um parcelamento" e "Dividir uma recorrência").

No uso, o dono do projeto precisou de mais:

- **Apontar sempre de quem recebe ou a quem paga** em "Todo mês" e "Parcelado": o aluguel que a Ana paga todo mês, o empréstimo pago ao Bruno em 10 vezes.
- **Dividir também uma entrada:** recebi R$ 1.000 de aluguel, e metade é do meu irmão.
- **Dividir uma recorrência ou um parcelamento** com uma ou mais pessoas ou membros do espaço: a conta de luz da casa, a TV comprada em 10 vezes.
- **Escolher a pessoa como se escolhe a categoria:** o campo de texto com sugestões do navegador (`<datalist>`) é pobre no celular e não separa membros de contatos.

## Opções consideradas

**A parte de quem divide uma entrada**

1. **Uma saída pendente "a pagar para" cada pessoa, em "Repasse"**, uma categoria padrão de saída, espelho do "Reembolso". A entrada fica inteira, porque foi o que entrou na sua conta.
2. **"Reembolso" também como saída:** menos nomes, mas "Reembolso" numa saída confunde.
3. **Escolher a categoria a cada divisão:** um campo a mais toda vez.

**Onde a recorrência guarda a divisão**

1. **Uma tabela `recurrence_shares`**, uma linha por pessoa, com o valor em reais ou em percentual. A recorrência gera as partes de cada mês junto com o lançamento.
2. **Copiar as partes do mês anterior:** depende de existir um mês anterior e propaga qualquer edição feita à mão, que pode ter sido só daquele mês.

**A parte numa recorrência de valor variável (luz, água)**

1. **Percentual, acompanhando o valor real:** quando o valor do mês é informado, as partes ainda pendentes daquele mês são recalculadas.
2. **Percentual, fixado no valor estimado:** as partes ficam erradas até alguém corrigir à mão, todo mês.

## Decisão

Escolhidos com o dono do projeto: **"Repasse" (opção 1)**, **tabela `recurrence_shares` (opção 1)** e **percentual que acompanha o valor real (opção 1)**.

**Seletor de pessoa**

- **No padrão da categoria** ([CategorySelect](../../apps/web/src/features/categories/category-picker.tsx)): busca sem diferenciar acentos, folha no celular e popover a partir de md.
- **Grupos:** "Membros" (sem você) e "Pessoas".
- **Quem não está na lista** entra por "Adicionar 'Nome'" e vira pessoa ao salvar, como antes.
- **Onde:** substitui o campo de texto em "A receber de / A pagar para" e em cada pessoa de "Dividir com alguém".

**Uma pessoa em "Todo mês" e "Parcelado"**

- **Campos:** `recurrences.person_id` e `installment_plans.person_id`, opcionais, com chave estrangeira composta para a pessoa do mesmo espaço, como em `transactions` ([ADR 0029](0029-lancamentos-e-integridade-no-banco.md)).
- **Os lançamentos herdam a pessoa:** cada mês gerado pela recorrência e cada parcela.
- **Mudar a pessoa de uma recorrência** alcança os pendentes deste mês em diante, como os outros campos ([ADR 0038](0038-recorrencias-e-parcelamentos.md)).
- **A pessoa precisa estar ativa.** Uma pessoa usada numa recorrência ou num parcelamento não é excluída, só arquivada (`PERSON_IN_USE`).
- **Como no avulso,** ou se liga uma pessoa ou se divide, nunca os dois.

**Dividir uma entrada**

- **O que é criado,** numa escrita só: a entrada inteira e uma saída pendente por pessoa, "Ana: parte de {descrição}", na categoria **"Repasse"**, ligada à pessoa e à entrada (`split_of_id`).
- **"Repasse"** entra nas categorias padrão de saída. Uma migração a cria nos espaços que ainda não a têm. Se foi arquivada ou excluída, a divisão a reativa ou cria de novo, como o "Reembolso".
- **O resto vale como na saída:** a sua parte pode ser zero, a soma das partes dos outros não passa do valor, e excluir a entrada pergunta se as partes vão junto.

**Dividir um parcelamento**

- **As partes** são informadas no mesmo sentido do valor (do total ou de cada parcela) ou em percentual.
- **Nascem com as parcelas,** na mesma escrita: em cada parcela, uma parte por pessoa, no lado oposto ao da parcela.
- **O total de cada pessoa fecha exato.** Em cada parcela, a parte segue a proporção da parcela, e os centavos que sobram ficam na última, a mesma regra de `splitInstallments`.
- **Encerrar o parcelamento** remove também as partes pendentes das parcelas removidas.

**Dividir uma recorrência**

- **A divisão fica guardada** em `recurrence_shares` (com RLS, [ADR 0028](0028-row-level-security.md)): a pessoa e exatamente um de valor em centavos ou percentual em pontos-base.
- **Valor variável:** só percentual. **Valor fixo:** reais ou percentual.
- **Cada mês aberto** cria o lançamento e a parte de cada pessoa juntos, na mesma escrita.
- **Mudar o valor da recorrência** recalcula as partes em percentual dos pendentes deste mês em diante. As partes em reais ficam, e um valor menor que a soma delas é recusado.
- **Informar o valor real** de um mês estimado recalcula as partes em percentual que ainda estão pendentes. É a exceção à regra do ADR 0042 de que as partes ficam independentes depois de criadas: só vale para as partes em percentual de uma recorrência, e só enquanto pendentes.
- **Encerrar a recorrência** remove também as partes pendentes dos meses removidos.

## Consequências

- **De quem se recebe e a quem se paga** passa a ficar registrado em tudo que se repete, e a página Pessoas mostra esses lançamentos como mostra os avulsos.
- **"Repasse" conta como gasto** no Painel e na Análise, assim como o "Reembolso" conta como entrada. O resultado do mês fecha, mas a entrada dividida parece maior que a sua parte, a mesma consequência registrada no ADR 0042 para a saída.
- **Mudam três tabelas e nasce uma:** `recurrences` e `installment_plans` ganham `person_id`, `categories` ganha "Repasse" por migração, e `recurrence_shares` entra com RLS, no teste de cobertura de RLS, na exportação de dados ([ADR 0041](0041-termos-exportacao-e-exclusao-de-conta.md)) e no `resetDatabase` dos testes.
- **Fica de fora:**
  - editar a divisão de uma recorrência já criada (por ora, encerra-se e cria-se outra);
  - dividir um lançamento que já existe;
  - "Enviar a parte" para quem usa o app, ainda com ADR próprio.
- **Entrega em passos, um por PR:**
  1. o seletor de pessoa;
  2. a pessoa na recorrência e no parcelamento;
  3. dividir uma entrada;
  4. o parcelamento dividido, API e tela;
  5. a recorrência dividida, API e tela.

## Nota ("Com quem?", 2026-10-12)

**A divisão escolhe as pessoas numa lista, não em linhas numeradas.** O dono do projeto não gostou de "Pessoa 1, Pessoa 2…": a pergunta é com quem dividir, e o campo de cada linha cortava nomes longos no celular. Agora:

- **"Com quem?"** abre o seletor de pessoa em seleção múltipla: cada toque marca ou desmarca alguém, a lista fica aberta, e "Adicionar 'Nome'" inclui quem ainda não está nela. No celular, "Pronto" fecha a folha.
- **Uma linha por pessoa escolhida, com o nome dela** e a parte ao lado (o campo se chama "Parte de Ana (R$)"); um "✕" a tira da divisão.
- **As partes nascem iguais,** você incluído, e acompanham o valor e as pessoas escolhidas até alguém digitar uma parte à mão. "Dividir igualmente" volta às partes iguais.
- **Uma lista fixa com caixas de marcar foi descartada:** com muitos contatos, vira uma parede no celular e esconde a busca e o "Adicionar 'Nome'".
- **Só a tela muda:** a API recebe o mesmo `split`. A mesma forma vale para a divisão no parcelamento e na recorrência, quando chegarem à tela.

## Nota (a descrição das partes, 2026-10-16)

Com o uso, apareceram dois problemas no formato "Ana: parte de {descrição}": mudar a descrição de uma recorrência dividida não chegava às partes (o reembolso continuava com o nome antigo), e o nome da pessoa gravado no texto envelhecia quando a pessoa era renomeada (ou o membro trocava o nome da conta).

- **A parte repete a descrição do que foi dividido,** sem o nome da pessoa: "Conta de luz", e numa parcela "Geladeira (3/10)", que diz qual parcela ela reembolsa. Quem é a pessoa a linha já mostra, em "A receber de Ana" ou "A pagar para Ana", pelo `personId`, sempre com o nome atual; a categoria (Reembolso ou Repasse) separa a parte do lançamento original. `shareDescription` (em `packages/shared`) monta o texto nos três lugares que criam partes.
- **A parte acompanha a edição:** mudar a descrição de um lançamento dividido, de uma recorrência (nos meses pendentes deste mês em diante) ou de um parcelamento (nas parcelas pendentes) muda também as **partes pendentes** ligadas a eles. Uma parte já paga ou recebida é histórico e fica como está, a mesma regra das parcelas pagas.
- **As partes antigas** ("Ana: parte de …") ficam como estão até a próxima edição da origem, que corrige as pendentes. Não há migração que reescreva descrições, porque ela mexeria também no que já foi pago.
- **A sugestão pelo histórico** continua deixando as partes de fora: com a mesma descrição da origem, elas sugeririam Reembolso ou Repasse.
