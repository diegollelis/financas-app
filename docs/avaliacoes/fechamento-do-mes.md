# Avaliação: fechamento do mês

- **Situação:** decidido no [ADR 0063](../adr/0063-fechamento-do-mes.md). Este texto guarda o levantamento que levou à decisão e o mapa que a implementação segue.
- **Data:** 2026-10-29

## A ideia

Depois de tudo pago e recebido, **fechar o mês** para que nada nele mude por engano, e **reabrir** quando for preciso corrigir algo. Hoje qualquer competência aceita mudanças a qualquer momento, mesmo as já conferidas.

## O que o código mostrou

- **Não há saldo carregado.** `summarizePeriod` (`packages/shared/src/summary.ts`) usa só as linhas do mês, o orçamento do mês, o dia de hoje e as categorias marcadas "Nem renda nem gasto". Um mês não depende do anterior, então cada um pode ser fechado e reaberto sozinho.
- **O orçamento herda.** Um mês sem orçamento salvo usa o último salvo antes dele (`source: INHERITED`, [ADR 0030](../adr/0030-orcamento-por-competencia-com-heranca.md)). Por isso salvar o orçamento de um mês anterior muda os meses que só herdam.
- **Não há trigger no banco,** e o `AppExceptionFilter` (`apps/api/src/common/error-reporting.ts`) não traduz erros do banco: cada serviço converte os códigos do Prisma (P2002, P2003, P2025).

### Caminhos que escrevem numa competência

Fechar o mês só protege se todos estes caminhos respeitarem a trava. Os caminhos ficam em `apps/api/src/`.

| Caminho                                                                               | O que alcança                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lançamentos: criar, editar, excluir                                                   | O mês do lançamento e o das partes da divisão. "Mover para outro mês" alcança o de origem e o de destino. Trocar a categoria recategoriza todas as partes, até as já pagas. |
| Recebimento/pagamento parcial (`settlePart`)                                          | A parte nasce no mês do dia informado, e o pendente diminui (ou é excluído) no mês dele.                                                                                    |
| `RecurrencesService.materialize`                                                      | Cria o mês da recorrência que falta em qualquer competência aberta na tela, **inclusive por um GET** (lista de lançamentos, resumo, análise, `imports/candidates`).         |
| Recorrências: criar, "Tornar recorrente", mudar, encerrar                             | O mês inicial (que pode ser passado); a mudança e o encerramento só tocam os pendentes do mês atual em diante.                                                              |
| Parcelamentos: criar, "Tornar parcelado", mudar, encerrar, excluir                    | A mudança sem valor alcança **todas** as parcelas pendentes, de qualquer mês. A troca de valor e a exclusão sem parcela paga apagam e recriam todas as parcelas.            |
| Importação: criar (linhas, parcelas, `parts`, `matches`, `bills`), desfazer, esquecer | Cada linha no seu mês; `matches` e `bills` quitam lançamentos já existentes; desfazer apaga o que ela trouxe e devolve os empréstimos. Esquecer só desliga a importação.    |
| Cartões: `bills/pay`, `bills/undo`, `link`                                            | A fatura quita lançamentos de vários meses. `link` dá o cartão a débitos já pagos de qualquer mês.                                                                          |
| Categorias: trocar a categoria da devolução (`moveLoanShares`)                        | Recategoriza todas as partes daquela categoria, pagas ou não, em qualquer mês.                                                                                              |
| Orçamento: `PUT budget/:period`                                                       | O mês salvo e os seguintes que herdam dele.                                                                                                                                 |
| Metas: arquivar, excluir                                                              | Arquivar só mexe do mês atual em diante. Excluir apaga os `budget_shares` da meta em todos os meses.                                                                        |
| Excluir o espaço ou a conta                                                           | Tudo, em cascata.                                                                                                                                                           |

### Configurações que mudam o passado sem tocar num lançamento

- **"Nem renda nem gasto"** (`categories.neutral`): o resumo lê a marcação atual, então desmarcar uma categoria muda a renda e os gastos de todos os meses.
- **Categoria da devolução ou da dívida** ([ADR 0058](../adr/0058-emprestado-para.md), [ADR 0059](../adr/0059-peguei-emprestado-de.md)): move partes já lançadas.
- **Metas:** uma meta nova aparece com 0% nos orçamentos passados; renomear muda o nome mostrado; excluir apaga a fatia.
- **Renomear** categoria, pessoa ou estabelecimento: só muda o nome mostrado.

## Alternativas descartadas

- **"Fechado até" (uma data limite no espaço, como o `MV_DATAFIN` do Protheus).** É mais simples, mas reabrir março para uma correção reabriria todos os meses seguintes. Como não há saldo carregado, nada obriga a fechar em ordem.
- **Guardar uma foto do resumo no fechamento.** Deixaria o mês fechado sempre com os números do dia, mas cria uma segunda verdade, que se afasta dos lançamentos assim que uma configuração muda. Travar o que dá e avisar o resto cobre o risco com menos peso.
- **Fechar com pendências.** O pendente ficaria preso no mês fechado, e para dar baixa nele seria preciso reabrir. Isso contraria a ideia de fechar só depois de tudo pago.
- **Travar só no serviço** (sem o banco). Os caminhos são muitos, e um caminho novo esquecido passaria sem aviso. O trigger é a rede de segurança, no mesmo espírito dos CHECKs do [ADR 0029](../adr/0029-lancamentos-e-integridade-no-banco.md).
