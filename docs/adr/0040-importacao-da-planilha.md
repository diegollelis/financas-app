# 0040 — Importação da planilha `.xlsx`

- **Status:** Aceita
- **Data:** 2026-10-07

## Contexto

O app substitui a planilha pessoal `Financas-app.xlsx` ([planilha de origem](../dominio/planilha-origem.md)). Para deixar a planilha de lado, o histórico precisa entrar no app. Também é preciso apontar o que estiver inconsistente nela; o documento lista os problemas 1 a 12.

A planilha tem dados bancários: descrições com chaves Pix, contas e nomes de terceiros. Ela nunca foi versionada, e a política de privacidade ([ADR 0012](0012-privacidade-lgpd.md)) pede que circule o mínimo possível.

## Opções consideradas

**Onde ler o arquivo:**

1. **Na API:** o arquivo inteiro sobe ao Render, é lido e descartado. É simples de testar, mas a planilha completa trafega e passa pelo servidor, inclusive as abas e colunas que não interessam.
2. **No navegador:** o app lê o arquivo no aparelho, mostra a prévia e o relatório, e envia à API só os lançamentos que a pessoa confirmar.

**Biblioteca para ler `.xlsx` no navegador** (conferido em 2026-10-07):

1. **`xlsx` (SheetJS) do npm:** está congelado na 0.18.5. As versões novas saem só pelo site deles, e a do npm tem falhas conhecidas.
2. **`exceljs`:** completo, mas pesado, com cerca de 21 MB instalado, e sem versão nova desde 2024.
3. **`read-excel-file`:** só lê, é pequeno e foi atualizado em 2026.

**Repetir uma importação:**

1. **Pular os meses que já têm lançamentos:** simples, mas não deixa corrigir uma importação errada.
2. **Registrar cada importação e permitir desfazê-la.**

## Decisão

- **A leitura é no navegador, com `read-excel-file`.** A biblioteca é carregada só na tela de importação (`import()` dinâmico), então não pesa no resto do app. O arquivo nunca sai do aparelho.
- **Só os lançamentos entram.** As categorias da planilha são ligadas às do app numa etapa da tela. O orçamento e os parcelamentos escritos no texto ficam de fora: "Parcela 04 de 08" vira só um aviso no relatório.
- **Cada importação é registrada** na tabela `imports`, com RLS ([ADR 0028](0028-row-level-security.md)), e `transactions.import_id` aponta para ela com `ON DELETE CASCADE`.
  - `POST /workspaces/:workspaceId/imports` cria a importação e todos os lançamentos numa só escrita: tudo ou nada.
  - `DELETE /workspaces/:workspaceId/imports/:importId` desfaz. Saem todos os lançamentos dela, inclusive os editados depois; a tela avisa disso antes de confirmar.
  - `GET` lista as importações, da mais nova para a mais antiga.
- **Cada lançamento importado segue as mesmas regras de um digitado:** o schema de criação de lançamento do `packages/shared` e a categoria do espaço, do tipo certo e não arquivada. A conferência das categorias é feita de uma vez para o lote (`ensureUsableCategories`), e a primeira inválida recusa a importação inteira com a mensagem em pt-BR.
- **No máximo 2.000 lançamentos por importação**, alguns anos de planilha.
  - Para caber, a rota de importação aceita corpos de até 4 MB, contra os 100 KB padrão do Express. O pior caso é 2.000 lançamentos com descrição e observação cheias, cerca de 3 MB.
  - O limite maior vale **só para essa rota**: as outras continuam em 100 KB, para ninguém mandar corpos grandes sem necessidade.
  - O proxy do Pages ([ADR 0033](0033-topologia-e-limites-do-deploy.md)) lê o corpo inteiro antes de repassar. 4 MB fica muito abaixo dos limites do plano gratuito: 100 MB por requisição e 128 MB de memória.
- **Como as colunas da aba mensal viram campos:**
  - Descrição vira `description`;
  - Valor vira `amount_cents`, em centavos;
  - Data vira o vencimento (`due_date`);
  - OK = `X` torna o lançamento efetivado (`settled_at`) na Data, ou no último dia da competência quando não houver data;
  - a competência vem do nome da aba (`2026-SETEMBRO` dá `2026-09`).
- **O relatório de inconsistências** aponta, por aba e linha:
  - valor zero ou vazio (problema 7): a linha fica de fora;
  - categoria vazia;
  - data fora da competência;
  - abas que não são de mês;
  - "Parcela N de M" (problema 6) e descrições que parecem ter dado sensível (problema 12), como avisos.
- **Os testes usam uma planilha fictícia** gerada no próprio teste (`write-excel-file`, só em desenvolvimento). O `.xlsx` continua no `.gitignore`.

## Consequências

- **Feito em três PRs:**
  1. API, `packages/shared` e este ADR;
  2. leitura da planilha, em funções puras testadas;
  3. a tela "Importar planilha", no "Mais".
- **Desfazer apaga também os lançamentos editados depois da importação.** Desfazer serve para corrigir uma importação errada logo em seguida, não para "voltar no tempo" meses depois.
- **A conta que importou fica registrada** (`created_by`). Se essa conta for excluída (LGPD), o registro fica sem autor e a importação continua.
- **`express` passou a ser dependência direta da API**, na mesma versão que o Nest já usava, para montar o parser de JSON com limite próprio só na rota de importação.
- **Rever este ADR** se aparecer outro formato de planilha, como CSV de banco ou outra estrutura de abas.

## Nota (só a planilha modelo, 2026-10-07)

A planilha antiga deixou de ser lida diretamente. A importação aceita **só uma planilha modelo**, num formato único que serve a qualquer pessoa do app, que é público. O dono copia o histórico da planilha antiga para o modelo uma vez. O mapeamento das abas mensais (`B22:G42` e `J22:O42`) descrito na Decisão fica sem efeito.

- **Aba "Lançamentos",** uma linha por lançamento e o cabeçalho na linha 1. As colunas são Competência, Tipo, Descrição, Categoria e Valor (obrigatórias) e Vencimento, Efetivado em e Observações (opcionais).
  - São achadas pelo título, em qualquer ordem e sem depender de maiúsculas ou acentos.
  - Se a aba foi renomeada, vale a primeira aba.
- **O que cada célula aceita:**
  - a competência vem como `2026-09`, `09/2026` ou uma data: o Excel transforma "2026-09" em data;
  - o valor vem como número ou como texto em reais (`1.500,00`);
  - as datas vêm como células de data ou como `dd/mm/aaaa`;
  - uma célula de data é lida em UTC, como a biblioteca a entrega, para não mudar de dia.
- **"Baixar planilha modelo"** gera o arquivo no próprio navegador, com `write-excel-file` carregado sob demanda. Ele vem com o cabeçalho, uma linha de exemplo fictícia e a aba "Categorias", com as categorias ativas do espaço.
- **O relatório** (`parseTemplateRows`, em `packages/shared`, puro e testado):
  - **erros,** que deixam a linha de fora: coluna obrigatória faltando, competência, tipo, valor ou data inválidos, descrição vazia ou longa e valor zero (problema 7);
  - **avisos:** "Parcela N de M" (problema 6), dado que parece pessoal, como CPF, Pix, conta ou e-mail (problema 12), e efetivação fora da competência.
- **A categoria chega como nome.** A tela liga cada nome a uma categoria do espaço antes de enviar.
- **Bibliotecas:** `read-excel-file` e `write-excel-file`, as duas do mesmo autor, só no `apps/web` e carregadas só na tela de importação.
- **Prévia e edição antes de confirmar.**
  - A tela lista as linhas por competência, com os totais. Cada linha pode ser desmarcada.
  - "Editar" abre a mesma gaveta do "Novo lançamento" já preenchida. A mudança vale só na prévia, e nada vai à API antes da confirmação.
  - Uma linha com erro não é descartada sem escolha: `parseTemplateRows` a devolve em `drafts`, com o que deu para ler (o que é inválido vem vazio), e "Corrigir" a abre no formulário para entrar na importação.
  - Para mudar muitas linhas de uma vez, a própria planilha continua sendo o melhor lugar: corrige-se e escolhe-se o arquivo de novo.
