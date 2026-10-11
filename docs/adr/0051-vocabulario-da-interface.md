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

**O código**

1. **Renomear também o código,** do banco aos schemas.
2. **Mudar só os textos,** com o glossário fazendo a ponte entre a tela e o código.

## Decisão

**Entrada / Saída, metas de guardar e só os textos mudam.**

### Os termos

| Conceito (código)      | Antes                                        | Agora                                                                                                     |
| ---------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `CREDIT` / `DEBIT`     | Crédito / Débito                             | **Entrada / Saída**; seções "Entradas" e "Saídas"; filtro "Todas, Entradas, Saídas"                       |
| `period`               | Competência                                  | **Mês**: "Mês anterior", "Escolher mês", o campo "Mês"                                                    |
| `settledAt` preenchido | Efetivado, Quitado, Pagos                    | **Pago** (saída) ou **Recebido** (entrada); filtro "Pagos e recebidos"; o parcelamento todo pago é "Pago" |
| marcar como efetivado  | Efetivar / Desfazer efetivação               | **Marcar como pago** ou **recebido**; **Desmarcar pagamento** ou **recebimento**                          |
| `PENDING`              | Pendente, A pagar, Agendado                  | **Pendente** como situação; "A pagar" e "A receber" só como valores                                       |
| `OVERDUE`              | Vencido                                      | Vencido                                                                                                   |
| visões do resumo       | Previsto / Efetivado                         | **Previsto / Realizado**                                                                                  |
| saldos                 | Saldo previsto / Saldo efetivado             | **Saldo previsto / Saldo atual**                                                                          |
| destino `EXPENSES`     | Despesas, "Limite de despesas", "meta"       | **Limite de gastos**, sempre "limite"; "Despesas" continua sendo o nome das saídas que não são guardadas  |
| destinos `SAVINGS`     | Destinos de guardar, Aplicar, Aplicado       | **Metas de guardar**; o botão **Guardar**; **Guardado**; o formulário "Guardar em {meta}"                 |
| `unallocated`          | Sem destino                                  | **Livre**                                                                                                 |
| bloco do Painel        | Orçamento por destino                        | **Orçamento do mês**                                                                                      |
| remoções               | Excluir, Apagar, Remover, Tirar              | **Excluir** para dados; **Remover** para um membro ou para uma pessoa da divisão; **Cancelar convite**    |
| a página de importação | "Importar" no menu, "Importar planilha" nela | **Importar planilha** nos dois                                                                            |

**"Meta" é só das metas de guardar.** Despesas tem um **limite**, que é um % da renda líquida; cada meta de guardar é um % do que sobra. São as duas bases do [ADR 0047](0047-orcamento-real-por-destino.md), agora com nomes que não se confundem.

**Na Análise, os rótulos seguem a visão:** "Entradas previstas" na visão prevista e "Recebido" na realizada.

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

- **Os títulos novos** são "Mês", "Tipo" (com Entrada e Saída) e "Pago ou recebido em".
- **A leitura continua aceitando** os títulos e os valores antigos ("Competência", "Crédito", "Débito", "Efetivado em"), porque já existem planilhas preenchidas com o modelo antigo ([ADR 0040](0040-importacao-da-planilha.md)).

### Os textos num lugar só

- Os rótulos repetidos em várias telas (os tipos e as situações) passam a vir de `packages/shared`, ao lado de `roleLabels`.
- É um passo na direção prometida pelo [ADR 0011](0011-idioma-do-codigo.md), de textos centralizados.

## Consequências

- **O app fala a língua de quem usa apps de finanças:** quem chega do Organizze, do Mobills ou do extrato do banco reconhece os nomes sem precisar aprender termos novos.
- **Uma regra para os próximos textos:** um termo novo da interface entra primeiro no glossário. Um conceito tem um nome só em todas as telas, nos toasts e nos e-mails.
- **A acessibilidade acompanha:**
  - o nome acessível (`aria-label`, texto só para leitores de tela) muda junto com o texto visível (WCAG 2.5.3);
  - a regra do axe que confere isso é experimental e fica fora das capturas, então a conferência é uma busca pelos termos antigos, mais os testes que buscam pelo nome acessível.
- **Os docs já escritos ficam como estão:** os ADRs anteriores usam os nomes antigos, porque registram o que foi decidido na época. Notas nos ADRs [0031](0031-painel-do-mes-previsto-e-efetivado.md) e [0047](0047-orcamento-real-por-destino.md) apontam para este.
- **Implementação:** este ADR e o glossário entram primeiro; as telas, a planilha modelo e os e-mails mudam num PR seguinte, com capturas e o axe zerado.
- **Quando rever:** se surgir uma API pública ou integrações de terceiros, os nomes do contrato (em inglês) entram num ADR próprio, com versionamento da API.
