# 0051 — Vocabulário da interface: os termos do mercado, sem mudar o código

- **Status:** Aceita
- **Data:** 2026-10-11

## Contexto

Os textos da interface nasceram da planilha de origem e do vocabulário contábil do Protheus. Uma revisão de todas as telas, depois da 1.0.1, encontrou dois problemas.

**Termos que quem usa apps de finanças pessoais não reconhece.** Organizze, Mobills e o extrato dos bancos digitais falam em entrada e saída, em mês, em pago e recebido. O app falava em:

- **"Crédito" e "Débito"**, que se confundem com o cartão de crédito e o cartão de débito;
- **"Competência"**, um termo contábil;
- **"Efetivar"**, para marcar uma conta como paga.

**O mesmo conceito com nomes diferentes de uma tela para outra:**

- **Dar baixa num lançamento:** "Efetivar", "Pago em", "Marcar como pago", "Quitado" e "Pagos". O filtro "Efetivados" ficava ao lado do selo "Pago em".
- **O que ainda não foi pago:** "Pendente", "A pagar" e "Agendado".
- **O mês escolhido:** "Competência", "mês" e "período".
- **O limite de despesas:** "Limite de despesas" no formulário do orçamento e "meta" no Painel.
- **O que vai para os destinos de guardar:** "Aplicar", "Aplicado" e "Aplicação". "Aplicar" é jargão de investimento e soa estranho para uma reserva de emergência deixada na poupança.
- **Na Análise,** "Recebido" e "Gasto" apareciam também na visão prevista. No Painel, "Recebidos" quer dizer só o que já entrou.
- **Para apagar:** "Excluir", "Apagar", "Remover" e "Tirar".

## Opções consideradas

**Os tipos de lançamento**

1. **Receita / Despesa**, como Organizze e Mobills. Esbarra no orçamento: "Despesas" já é o nome do destino fixo, que conta só as saídas que não vão para um destino de guardar ([ADR 0047](0047-orcamento-real-por-destino.md)). Um dinheiro guardado em Investimentos apareceria como "despesa".
2. **Entrada / Saída**, como o extrato do Nubank e do Mercado Pago. Neutro: uma saída pode ser uma despesa ou um valor guardado.
3. **Manter Crédito / Débito.**

**Os destinos de guardar**

1. **Manter "destinos" e "Aplicar".**
2. **"Caixinhas".** É um termo reconhecível, mas é associado a um banco.
3. **"Metas de guardar"**, com o verbo **Guardar**.
4. **Só "Metas"**, com o verbo **Guardar**, já que "meta" deixa de ser usada para o limite de gastos.

**O código**

1. **Renomear também o código,** do banco aos schemas.
2. **Mudar só os textos,** com o glossário fazendo a ponte entre a tela e o código.

## Decisão

**Entrada / Saída, "Metas" e só os textos mudam.**

### Os termos

| Conceito (código)      | Antes                                        | Agora                                                                                                     |
| ---------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `CREDIT` / `DEBIT`     | Crédito / Débito                             | **Entrada / Saída**; seções "Entradas" e "Saídas"; filtro "Todas, Entradas, Saídas"                       |
| `period`               | Competência                                  | **Mês**: "Mês anterior", "Escolher mês"; na importação, "Mês de referência"                               |
| `settledAt` preenchido | Efetivado, Quitado, Pagos                    | **Pago** (saída) ou **Recebido** (entrada); filtro "Pagos e recebidos"; o parcelamento todo pago é "Pago" |
| marcar como efetivado  | Efetivar / Desfazer efetivação               | **Marcar como pago** ou **recebido**; **Desmarcar pagamento** ou **recebimento**                          |
| `PENDING`              | Pendente, A pagar, Agendado                  | **Pendente** como situação; "A pagar" e "A receber" só como valores                                       |
| `OVERDUE`              | Vencido                                      | Vencido                                                                                                   |
| visões do resumo       | Previsto / Efetivado                         | **Previsto / Realizado**                                                                                  |
| saldos                 | Saldo previsto / Saldo efetivado             | **Saldo previsto / Saldo atual**                                                                          |
| destino `EXPENSES`     | Despesas, "Limite de despesas", "meta"       | **Limite de gastos**, sempre "limite"; "Despesas" continua sendo o nome das saídas que não são guardadas  |
| destinos `SAVINGS`     | Destinos de guardar, Aplicar, Aplicado       | **Metas**; o botão **Guardar**; **Guardado**; o formulário "Registrar valor guardado"                     |
| `unallocated`          | Sem destino                                  | **Sem meta**                                                                                              |
| bloco do Painel        | Orçamento por destino                        | **Orçamento do mês**                                                                                      |
| remoções               | Excluir, Apagar, Remover, Tirar              | **Excluir** para dados; **Remover** para um membro ou para uma pessoa da divisão; **Cancelar convite**    |
| a página de importação | "Importar" no menu, "Importar planilha" nela | **Importar planilha** nos dois                                                                            |

**"Meta" é só do que se guarda.** Despesas tem um **limite**, que é um % da renda líquida; cada meta é um % do que sobra. São as duas bases do [ADR 0047](0047-orcamento-real-por-destino.md), agora com nomes que não se confundem.

**Na Análise, nenhum rótulo afirma o que a visão não garante:** "Entradas" e "Despesas" valem nas duas visões, e o dinheiro das metas é "Para guardar" na prevista e "Guardado" na realizada. Os rankings são "Entradas por categoria" e "Despesas por categoria".

**"Progresso" é o % da meta.** Na tabela das metas, a coluna que diz quanto da meta já foi guardado se chama "Progresso", e não "Realizado", para não se confundir com a visão "Realizado" da Análise.

**Continuam iguais,** porque já são os termos do mercado: Lançamento, Categoria, Espaço, Painel, Análise, Recorrências, Parcelamento e Parcela, Pessoas, Reembolso, Renda líquida, Disponível para guardar, e os acessos Dono, Pode editar e Só visualizar.

### O código não muda

- **Os nomes do código já são termos corretos em inglês:** `CREDIT`/`DEBIT`, `period`, `settledAt`, `EXPENSES`/`SAVINGS`, `appliedCents` e `unallocated`. Entrada, Pago e Guardado são escolhas de **apresentação**, e não mudam o conceito.
- **Renomear teria custo alto:**
  - os enums e as colunas exigiriam migração no banco;
  - a API e o web mudariam juntos, porque o web valida as respostas com os schemas compartilhados ([ADR 0006](0006-validacao-zod-compartilhada.md));
  - as chaves do JSON da exportação ([ADR 0041](0041-termos-exportacao-e-exclusao-de-conta.md)) deixariam de bater com o que já foi baixado.
- **O [glossário](../dominio/glossario.md) é a ponte.** Ele diz qual rótulo cada nome do código tem na tela, como o SX3 do Protheus separa `X3_CAMPO`, o nome técnico, de `X3_TITULO`, o que o usuário vê.
- **Os endereços continuam iguais,** mesmo sendo visíveis: `?competencia=` e `?situacao=efetivados` estão em favoritos e nos links do Painel.

### A planilha modelo

- **Os títulos novos** são "Mês de referência" (ao lado de "Vencimento" e de "Pago ou recebido em", "Mês" sozinho poderia ser lido como o mês do pagamento), "Tipo" (com Entrada e Saída) e "Pago ou recebido em".
- **A leitura continua aceitando** os títulos e os valores antigos ("Competência", "Crédito", "Débito", "Efetivado em"), porque já existem planilhas preenchidas com o modelo antigo ([ADR 0040](0040-importacao-da-planilha.md)).

### Os textos num lugar só

- Os rótulos repetidos em várias telas (os tipos e as situações) passam a vir de `packages/shared`, ao lado de `roleLabels`.
- É um passo na direção prometida pelo [ADR 0011](0011-idioma-do-codigo.md), de textos centralizados.

### Ajustes da revisão da prévia

Uma revisão externa da prévia das telas mudou cinco pontos da primeira versão desta tabela:

- **"Metas de guardar" virou "Metas".** "Metas de guardar" soava artificial e se repete em muitas telas. "Metas de reserva" repetiria "Reserva de emergência", e "Metas de economia" pode ser lido como cortar despesas. Como "meta" deixou de ser usada no limite de gastos, a palavra sozinha basta.
- **"Livre" virou "Sem meta".** Ao lado de "Saldo atual", "Livre" podia ser lido como um saldo à parte. Uma frase abaixo da tabela diz o que é: _"Sem meta: parte do Disponível para guardar que nenhuma meta recebeu. É uma divisão do orçamento, não um saldo."_
  - O valor é uma parte do disponível **previsto** (`unallocated` sai de `available.plannedCents`), por isso a frase não fala em "o que sobrou".
  - A frase **não diz que o valor não pode ser gasto**: ele não está reservado para nada e já faz parte do Saldo previsto. Uma versão anterior dizia "Não é dinheiro livre para gastar", o que contradiz o cálculo. O risco real é ler esse valor como um saldo, e é isso que a frase evita.
- **"Guardar em {meta}" virou "Registrar valor guardado"** no título do formulário, com a meta na descrição. O app registra o valor e não faz aplicação nenhuma; o título não pode prometer isso. O botão do Painel continua "Guardar".
- **A descrição preenchida é "Aporte em {meta}".** O lançamento nasce pendente e é pago depois: um substantivo serve aos dois estados, enquanto "Valor guardado em…" afirmaria um pagamento que ainda não aconteceu, e "Guardar em…" pareceria uma tarefa na lista. A pessoa pode editar o texto.
- **"Alcançado" virou "Progresso"**, o rótulo comum de uma coluna de percentual.
- **Na importação, "Mês de referência".** A navegação continua com "Mês".

**Ficaram como estavam, depois de conferidos:**

- **"Despesas" ao lado de "Entradas" e "Saídas".** Despesa é a saída que não vai para uma meta, e "Despesas por categoria" deixa de fora o que foi guardado.
- **"Pendente" e "Falta" nas metas.** São números diferentes: Pendente é o que já foi lançado e não foi pago, e Falta é o que ainda nem foi lançado. "A guardar" juntaria os dois.

## Consequências

- **O app fala a língua de quem usa apps de finanças:** quem chega do Organizze, do Mobills ou do extrato do banco reconhece os nomes sem precisar aprender termos novos.
- **Uma regra para os próximos textos:** um termo novo da interface entra primeiro no glossário. Um conceito tem um nome só em todas as telas, nos toasts e nos e-mails.
- **A acessibilidade acompanha:**
  - o nome acessível (`aria-label`, texto só para leitores de tela) muda junto com o texto visível (WCAG 2.5.3);
  - a regra do axe que confere isso é experimental e fica fora das capturas, então a conferência é uma busca pelos termos antigos, mais os testes que buscam pelo nome acessível.
- **Os docs já escritos ficam como estão:** os ADRs anteriores usam os nomes antigos, porque registram o que foi decidido na época. Notas nos ADRs [0031](0031-painel-do-mes-previsto-e-efetivado.md) e [0047](0047-orcamento-real-por-destino.md) apontam para este.
- **Implementação:** este ADR e o glossário entram primeiro; as telas, a planilha modelo e os e-mails mudam num PR seguinte, com capturas e o axe zerado.
- **Quando rever:** se surgir uma API pública ou integrações de terceiros, os nomes do contrato (em inglês) entram num ADR próprio, com versionamento da API.

## Nota ("Sobra para guardar", 2026-10-20)

"Disponível para guardar" virou **"Sobra para guardar"**. O código continua `available`.

- **"Disponível" confundia.** Em app de banco, "disponível" é o dinheiro na conta ("saldo disponível"), e aqui é uma conta do planejamento: entradas previstas menos despesas previstas. Lido ao lado de "Saldo atual", parecia um segundo saldo.
- **Havia dois nomes para a mesma coisa.** O bloco se chamava "O que sobra para guardar" e o valor dentro dele, "Disponível para guardar".
- **Um valor negativo lê melhor:** "Sobra para guardar: −R$ 500,00", com o aviso "Nada sobrou para guardar este mês", em vez de um "disponível" negativo. "Quanto sobra no fim do mês" é a expressão de todo dia.

**A legenda da barra "Para onde vão as entradas"** deixa de mostrar "Saldo previsto R$ 0,00" num mês negativo. A barra não desenha um valor negativo, e a legenda repetia o termo do número grande com outro valor. Agora essa parte sai da barra e da legenda, e o aviso "As saídas passam das entradas em R$ X" continua.
