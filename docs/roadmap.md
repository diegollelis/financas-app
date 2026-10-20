# Roadmap

Cada fase termina com algo funcionando e revisado. Decisões novas surgidas no caminho viram ADRs ([docs/adr](adr/README.md)).

## Versões

As versões são tags com versionamento semântico, cada uma com a sua release no GitHub ([ADR 0050](adr/0050-versionamento.md)).

- **1.0.0** (2026-10-10): as fases 1 a 4, o front-end mobile-first, a revisão das telas, dos textos legais e da segurança, e as categorias e os destinos padrão genéricos. É o início do uso real.
- **1.0.1** (2026-10-10): sessão encerrada em outro aparelho (ou expirada) leva à tela de login com o aviso "Sua sessão terminou. Entre de novo para continuar.", acima do cartão, e volta à mesma página depois de entrar; voltar à aba já confere a sessão.
- **1.1.0** (2026-10-11): o vocabulário da interface com os termos dos apps de finanças pessoais ([ADR 0051](adr/0051-vocabulario-da-interface.md)): Entrada e Saída, Mês, "Marcar como pago" e "Marcar como recebido", Limite de gastos, Metas, Guardar e "Sem meta"; a planilha modelo com "Mês de referência", que continua lendo as antigas; e as mensagens da API sobre metas e pessoas aparecendo na tela, em vez do erro genérico.
- **1.1.1** (2026-10-11): em Lançamentos, a busca ganha uma linha inteira, com o filtro de situação embaixo (no tablet, o rótulo e o filtro não quebram mais); Minha conta abre na moldura do último espaço usado, com o menu lateral ou a barra inferior.
- **1.2.0** (2026-10-12): num espaço compartilhado, os membros viram pessoas sozinhos, com os selos "Membro" e "Você" em Pessoas (nota no [ADR 0042](adr/0042-pessoas-e-rateio.md)); a pessoa é escolhida como a categoria, com busca, "Membros" à parte e "Adicionar 'Nome'"; e "A receber de / A pagar para" também em "Todo mês" e "Parcelado", copiado para cada mês e cada parcela ([ADR 0052](adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md)). No celular, os detalhes de cada linha de Recorrências ocupam a largura inteira.
- **1.3.0** (2026-10-12): dividir também uma entrada, com a parte de cada pessoa virando uma saída pendente na nova categoria "Repasse"; dividir um parcelamento, com a parte de cada pessoa em cada parcela ("Ana: parte de TV (3/10)") e a prévia por parcela; e "Com quem?" escolhendo várias pessoas de uma vez, com uma linha por pessoa e as partes iguais até você mudar alguma ([ADR 0052](adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md)).
- **1.4.0** (2026-10-13): dividir também o que se repete todo mês: cada mês nasce com a parte de cada pessoa; numa conta variável, as partes são em % e acompanham o valor real informado; Recorrências mostra "Dividido com Ana (50%)"; e encerrar a recorrência remove as partes pendentes. Com isso, o [ADR 0052](adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md) está completo.
- **1.5.0** (2026-10-13): estabelecimentos ([ADR 0053](adr/0053-estabelecimentos.md)): onde se comprou ou quem pagou, escolhido em "Mais opções" do lançamento (também em "Todo mês" e "Parcelado", copiado para cada mês e cada parcela), com "Adicionar 'Nome'"; o nome aparece na linha do lançamento e entra na busca; a página Estabelecimentos, no Mais, para renomear, arquivar, reativar e excluir os arquivados sem uso. E "Adicionar 'Nome'" também na categoria, criada ao salvar, com uma arquivada de mesmo nome voltando.
- **1.6.0** (2026-10-13): o [ADR 0053](adr/0053-estabelecimentos.md) completo: na Análise, uma categoria aberta mostra "Por estabelecimento", quanto foi para cada um no período; a planilha modelo ganha a coluna opcional "Estabelecimento", e um nome novo vira estabelecimento ao importar; e, num lançamento novo, a categoria vazia vem preenchida pelo histórico (o estabelecimento, depois a descrição), com "Sugerida pelo histórico", sem nunca trocar uma escolha sua.
- **1.6.1** (2026-10-13): no celular, o botão fixo "Novo lançamento" (e "Importar N lançamentos", na revisão da importação) não cobre mais os links do rodapé no fim da página.
- **1.7.0** (2026-10-14): "Tornar recorrente" no menu de um lançamento avulso: ele vira o primeiro mês de uma recorrência com a mesma categoria, valor, vencimento, pessoa e estabelecimento, fixa ou variável, e os próximos meses aparecem pendentes ao abrir cada um ([ADR 0038](adr/0038-recorrencias-e-parcelamentos.md)).
- **1.8.0** (2026-10-14): o vencimento de uma recorrência ou de um parcelamento pode cair no mês seguinte ao do lançamento, como a conta de luz de outubro que vence em 10/11 ou a fatura do cartão: o formulário avisa "Cada mês vence no dia 10 do mês seguinte", Recorrências mostra "Vence dia 10 do mês seguinte" e a edição ganha "Vence no: Mesmo mês / Mês seguinte", que corrige também as recorrências criadas antes ([ADR 0038](adr/0038-recorrencias-e-parcelamentos.md)).
- **1.9.0** (2026-10-14): Lançamentos e Recorrências também como tabela, a partir de 1280 px ("Ver como: Lista | Tabela", lembrado no navegador), com as colunas alinhadas e ordenadas pelo título clicado ([ADR 0045](adr/0045-largura-por-pagina-e-grade-do-painel.md)); o botão da linha de um lançamento vira "○ Pagar" / "○ Receber", com contorno, e o menu ⋯ ganha "Marcar como pago / recebido" ([ADR 0036](adr/0036-design-mobile-first.md)); e o link ativo da barra lateral com contraste de texto.
- **1.10.0** (2026-10-15): meio de pagamento ([ADR 0054](adr/0054-meio-de-pagamento.md)): "Meio de pagamento" numa saída e "Meio de recebimento" numa entrada, em "Mais opções" (Pix, Débito, Crédito, Dinheiro, Boleto, Transferência ou Débito automático), também em "Todo mês" e "Parcelado", copiado para cada mês e cada parcela e editável na recorrência; o meio aparece na linha, na tabela (coluna "Estabelecimento / Meio") e entra na busca; e "Cartão de crédito" deixa de ser categoria padrão nos espaços novos.
- **1.11.0** (2026-10-15): o meio de pagamento vem sugerido pelo histórico, como a categoria (o mais usado com o estabelecimento ou a descrição, com "Sugerido pelo histórico", sem trocar uma escolha feita à mão), e sai de "Mais opções" para logo após o vencimento ([ADR 0054](adr/0054-meio-de-pagamento.md)); e, a partir de 1024 px, o diálogo do lançamento fica mais largo, com os campos curtos lado a lado ([ADR 0036](adr/0036-design-mobile-first.md)).
- **1.12.0** (2026-10-15): o meio de pagamento "Vale-alimentação/refeição", logo depois de "Crédito", para o vale do empregador, também o aceito só nos estabelecimentos da própria empresa ([ADR 0054](adr/0054-meio-de-pagamento.md)); e "Bônus" entre as categorias padrão de entrada dos espaços novos ([ADR 0024](adr/0024-espacos-membros-e-espaco-pessoal.md)).
- **1.13.0** (2026-10-15): na Análise, "Despesas por meio de pagamento" (ou "Entradas por meio de recebimento"), com os mesmos filtros das categorias e "Sem meio" por último ([ADR 0054](adr/0054-meio-de-pagamento.md)); e o parcelamento editável em Recorrências: o que ele é muda a qualquer momento nas parcelas pendentes, o valor e as parcelas só enquanto nenhuma foi paga, "Excluir parcelamento" quando nada foi pago e o histórico como "Encerrados e quitados" ([ADR 0038](adr/0038-recorrencias-e-parcelamentos.md)).
- **1.14.0** (2026-10-16): a planilha modelo ganha a coluna opcional "Meio de pagamento", lida pelo nome do app ou por sinônimos comuns (como "VR" e "TED"), com aviso para um valor fora da lista e a aba "Meios de pagamento" na planilha baixada; na revisão, o meio aparece na linha e pode ser trocado em "Editar" ([ADR 0054](adr/0054-meio-de-pagamento.md)).
- **1.15.0** (2026-10-16): recorrência anual, para IPVA, IPTU, anuidade e seguro: "Todo ano" no "Repetir" do novo lançamento e no "Tornar recorrente", com o lançamento só no mesmo mês de cada ano; o selo "Todo ano" nos lançamentos; e, em Recorrências, a seção "Recorrentes" com a frequência de cada uma, o próximo mês de uma anual, a coluna "Repete" na tabela e o total "Por ano" separado do "Por mês" ([ADR 0038](adr/0038-recorrencias-e-parcelamentos.md)).
- **1.15.1** (2026-10-16): a parte de uma divisão repete a descrição do que foi dividido, sem o nome da pessoa ("Conta de luz", "Geladeira (3/10)"), e mudar a descrição de um lançamento dividido, de uma recorrência ou de um parcelamento renomeia também as partes pendentes; as já pagas ou recebidas ficam como estão ([ADR 0052](adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md)).
- **1.16.0** (2026-10-16): Lançamentos mais fácil de ler: o valor com sinal ("+ R$" em verde nas entradas, "− R$" nas saídas, também nos totais), o resumo "Entradas / Saídas / Saldo previsto" do mês no topo, "Pendente" só para quem não pode pagar (o botão "○ Pagar" já diz) e um cartão por lançamento na lista; e o selo "Vencido" com contraste certo também no tema escuro ([ADR 0036](adr/0036-design-mobile-first.md)).
- **1.16.1** (2026-10-17): as listas e tabelas de todas as telas no mesmo padrão: a tabela de Lançamentos com faixas alternadas, a situação embaixo da data e a coluna "Onde / Meio"; um cartão por item em Recorrências, na revisão da importação e em Pessoas; faixas nas tabelas de Recorrências; cartões compactos em duas colunas em Categorias e Estabelecimentos; e o fundo de cartão nas listas de configuração ([ADR 0036](adr/0036-design-mobile-first.md)).
- **1.16.2** (2026-10-17): Reembolso e Repasse fixos, com o selo "Divisão" em Categorias e sem renomear, arquivar ou excluir, e as partes de cada divisão sempre nessas duas, sem criar outra; e a parte de uma divisão vencendo com o que foi dividido, acompanhando a mudança do vencimento, com as partes pendentes já gravadas corrigidas ([ADR 0052](adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md)).
- **1.17.0** (2026-10-17): a data da compra: "Data da compra" numa saída e "Data" numa entrada, separada do mês de referência e do vencimento, já com hoje num lançamento novo do mês atual; "Compra em 28/09" na linha, a coluna "Data" na tabela, que também ordena, e a coluna opcional "Data" na planilha modelo, lida na importação e levada na exportação de dados. As partes de uma divisão ganham a mesma data ([ADR 0055](adr/0055-importacao-da-fatura-do-cartao.md)).
- **1.18.0** (2026-10-18): apelidos de estabelecimento, os textos como ele aparece na fatura do cartão: "Apelidos" no menu de cada estabelecimento, a contagem no cartão ("2 apelidos") e a busca e o seletor do lançamento encontrando pelo apelido; o "Parcelado" para uma compra já em andamento, com "Começa na parcela" (3 de 10 cria da 3/10 à 10/10) e a data da compra em todas as parcelas; em Recorrências, as pagas contando as anteriores ("2 de 10 pagas") e uma recorrência encerrada com o período completo ("Janeiro a maio de 2026"); e a edição de um mês de recorrência sem o campo de data ([ADR 0055](adr/0055-importacao-da-fatura-do-cartao.md), [ADR 0038](adr/0038-recorrencias-e-parcelamentos.md)).
- **1.19.0** (2026-10-19): importar a fatura do cartão Nubank ([ADR 0055](adr/0055-importacao-da-fatura-do-cartao.md)): em Importar, "Planilha modelo" ou "Fatura Nubank"; o arquivo .csv é lido no aparelho e a revisão abre na hora, com o mês de referência sugerido, o vencimento digitado e a "Origem"; cada linha já vem com o estabelecimento pelo apelido, a categoria pelo histórico e o meio "Crédito"; a parcela cobrada vira um parcelamento a partir do número dela (ou fica de fora, se já estiver lançado), o pagamento da fatura anterior e o que já está no mês vêm desmarcados com o motivo, e o estorno entra como entrada; a escolha de uma linha vale para as de mesmo texto e para as que começam com o apelido aprendido, e um estabelecimento novo aparece para as outras linhas antes de importar; desfazer a importação apaga também os parcelamentos. As categorias padrão de um espaço novo seguem as dos apps do mercado, com "Cuidados pessoais", "Presentes e doações" e "Pets"; e o estabelecimento também na edição de recorrências e parcelamentos.
- **1.20.0** (2026-10-19): na importação pela planilha modelo, a coluna opcional "Pessoa" (a receber de, numa entrada; a pagar para, numa saída), com a pessoa achada pelo nome, reativada ou criada; e a categoria que falta pode ser criada ali mesmo, pelo "Adicionar" do seletor ou pelo botão "Criar" para todas, só no momento de importar. O "Adicionar" de categoria também vale nas linhas da fatura do cartão ([ADR 0040](adr/0040-importacao-da-planilha.md)).
- **1.21.0** (2026-10-19): dividir um lançamento já lançado: "Editar" de um lançamento avulso que ainda não foi dividido tem "Dividir com alguém", com as partes nascendo pendentes; e "Tornar recorrente" também para um lançamento dividido, levando a divisão para a recorrência (o valor de cada pessoa numa fixa, a % de cada mês numa variável), o que permite importar uma conta, dividi-la e torná-la recorrente ([ADR 0052](adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md)).
- **1.22.0** (2026-10-20): "Tornar parcelado" no menu de um lançamento avulso e não dividido, para uma conta importada que na verdade é parcelada: ele vira a parcela informada (3 de 10, por exemplo) de um parcelamento novo, com o valor da parcela ou o total e a mesma prévia do "Parcelado", e as próximas parcelas aparecem pendentes nos meses seguintes; e o lançamento que deu origem a uma recorrência ou a um parcelamento volta a ser avulso, se ainda estiver pendente, ao encerrar a recorrência ou ao excluir ou encerrar o parcelamento, como avisam os diálogos ([ADR 0038](adr/0038-recorrencias-e-parcelamentos.md)).
- **1.22.1** (2026-10-20): em Pessoas, "Te deve" e "Você deve" contam só o que está pendente até o mês atual, com a parte vencida em vermelho e "Mais R$ X em parcelas" para as parcelas dos meses seguintes; os meses de recorrência à frente, criados ao navegar, deixam de aumentar os totais e saem de "Ver lançamentos" até chegar o mês deles ([ADR 0042](adr/0042-pessoas-e-rateio.md)).
- **1.22.2** (2026-10-20): o tipo de um lançamento não muda depois de lançado: ao editar, "Saída | Entrada" mostra o tipo marcado, o outro desativado e o motivo embaixo; e a API recusa a troca numa parte de divisão, num lançamento dividido, num mês de recorrência e numa parcela, que deixaria a divisão ou a série incoerente ([ADR 0029](adr/0029-lancamentos-e-integridade-no-banco.md)).
- **1.23.0** (2026-10-20): o Painel em cartões: "Saldo do mês" com o saldo previsto, entradas e saídas com o que já aconteceu, a barra e o saldo atual; "Limite de gastos" com "Gastos R$ X de R$ Y" num medidor; e "Metas" com a sobra para guardar, o guardado e uma linha por meta com o progresso, o pendente e o que falta lançar. Sem orçamento, um cartão só oferece defini-lo. As explicações saem da tela e vão para um ícone ⓘ ao lado de cada termo, e "Disponível para guardar" passa a se chamar "Sobra para guardar". No celular, o Painel ficou com menos da metade da altura ([ADR 0045](adr/0045-largura-por-pagina-e-grade-do-painel.md), [ADR 0036](adr/0036-design-mobile-first.md), [ADR 0051](adr/0051-vocabulario-da-interface.md)).
- **1.24.0** (2026-10-20): a Análise filtra também por meio de pagamento (com "Sem meio") e por estabelecimento, nos totais, no gráfico e nos rankings, com os seis filtros à vista e as três listas (categorias, meios e estabelecimentos) no mesmo menu; o subtítulo diz todos os filtros ativos, com "Limpar filtros". A página passa a usar cartões, como o Painel, com "Gastos" no lugar de "Despesas", a comparação com o período anterior numa linha curta e as explicações no ícone ⓘ ([ADR 0037](adr/0037-analise-de-periodos.md), [ADR 0051](adr/0051-vocabulario-da-interface.md)).

## Fase 0 — Planejamento ✅

- [x] Avaliação da planilha de origem ([dominio/planilha-origem.md](dominio/planilha-origem.md))
- [x] Stack, hospedagem e multi-tenancy decididos (ADRs 0001–0012)
- [x] Modelo de domínio inicial e glossário

## Fase 1 — Fundação do código ✅

- [x] Instalar pnpm (`npm i -g pnpm`)
- [x] Monorepo pnpm workspaces, TypeScript base, ESLint e Prettier
- [x] `apps/api`: NestJS com rota `/health`, Swagger, config por variáveis de ambiente
- [x] `apps/web`: React + Vite + Tailwind + shadcn/ui, chamando `/health`
- [x] `packages/shared`: primeiro schema Zod consumido pelos dois lados
- [x] Postgres local via Docker Compose; Prisma configurado com a primeira migração
- [x] Vitest nos três pacotes
- [x] GitHub Actions: workflow de CI (lint, typecheck, testes, build) e Dependabot
- [x] Criar o repositório no GitHub, fazer o primeiro push e proteger a `main`
- [x] Repositório público: proteção contra vazamento de segredos ([ADR 0019](adr/0019-repositorio-publico.md))
- [x] Comandos documentados no `CLAUDE.md` e no `README.md`

## Fase 2 — Autenticação e espaços ✅

- [x] Better Auth ([ADR 0020](adr/0020-integracao-better-auth-nestjs.md))
  - [x] API: cadastro, login e logout com e-mail e senha; `GET /me`; testes com Postgres real
  - [x] Web: telas de cadastro, login e logout ([ADR 0021](adr/0021-sessao-e-formularios-no-front.md))
  - [x] Verificação de e-mail e recuperação de senha (Mailpit local, Resend em produção — [ADR 0022](adr/0022-envio-de-email.md))
  - [x] Login com Google ([ADR 0026](adr/0026-login-com-google.md))
- [x] Rate limit nas rotas de autenticação ([ADR 0023](adr/0023-rate-limit-autenticacao.md))
- [x] Workspace, Member e papéis; espaço pessoal criado no cadastro ([ADR 0024](adr/0024-espacos-membros-e-espaco-pessoal.md))
- [x] Guard de espaço + repositórios sempre filtrando por `workspace_id` ([ADR 0025](adr/0025-guard-de-espaco-e-isolamento.md))
- [x] Testes de isolamento entre espaços (`expectHiddenFromOutsiders`, um por recurso)
- [x] RLS no PostgreSQL como segunda barreira: desenho e prova de conceito ([ADR 0028](adr/0028-row-level-security.md))
- [x] Convite de membros por e-mail ([ADR 0027](adr/0027-convites-por-email.md))
  - [x] API: convidar, listar, cancelar, ver e aceitar pelo link
  - [x] Web: página do espaço (membros e convite), página do convite e volta após o login

## Fase 3 — Núcleo financeiro ✅

- [x] RLS na prática ([ADR 0028](adr/0028-row-level-security.md)): papel `financas_app` para a API, URL separada para migrações e `prisma.forWorkspace()`
- [x] Categorias (com categorias padrão no novo espaço), primeira tabela com RLS
  - [x] API: tabela `categories` com RLS, categorias padrão em todo espaço novo, rotas `/workspaces/:workspaceId/categories`
  - [x] Tela de categorias no front (`/espacos/:workspaceId/categorias`)
- [x] Lançamentos por competência: criar, editar, excluir, efetivar em um clique
  - [x] API: tabela `transactions` com RLS e regras no banco ([ADR 0029](adr/0029-lancamentos-e-integridade-no-banco.md)), rotas `/workspaces/:workspaceId/transactions?period=`
  - [x] Tela de lançamentos da competência (`/espacos/:workspaceId/lancamentos?competencia=AAAA-MM`)
- [x] Configuração de orçamento por competência
  - [x] API: tabela `budget_configs` com RLS e herança da última competência salva ([ADR 0030](adr/0030-orcamento-por-competencia-com-heranca.md)), rotas `/workspaces/:workspaceId/budget/:period`
  - [x] Tela de orçamento da competência (`/espacos/:workspaceId/orcamento?competencia=AAAA-MM`)
- [x] Painel do mês: indicadores da planilha, status por cor, gráfico
  - [x] API: `GET /workspaces/:workspaceId/summary/:period`, visões prevista e efetivada ([ADR 0031](adr/0031-painel-do-mes-previsto-e-efetivado.md))
  - [x] Tela do painel (`/espacos/:workspaceId/painel?competencia=AAAA-MM`), gráfico sem biblioteca ([ADR 0032](adr/0032-graficos-sem-biblioteca.md))
- [x] Navegação entre competências (anterior, próxima e mês atual nas telas de lançamentos, orçamento e painel)

## Fase 4 — Deploy ✅

- [x] Conferir limites atuais dos planos gratuitos e definir a topologia ([ADR 0033](adr/0033-topologia-e-limites-do-deploy.md))
- [x] Proxy `/api/*` numa Pages Function: front e API no mesmo site, cookie `Lax` ([ADR 0033](adr/0033-topologia-e-limites-do-deploy.md))
- [x] IP real do cliente para o rate limit: `CF-Connecting-IP` repassado pela Function com um segredo ([ADR 0023](adr/0023-rate-limit-autenticacao.md)), conferido em produção
- [x] Imagem Docker da API com migrações ao iniciar o container (o Render free não tem _pre-deploy_), construída no CI
- [x] Neon (produção, PostgreSQL 18+: as migrações usam `uuidv7()`), Resend e API no Render, seguindo [docs/deploy.md](deploy.md)
- [x] Front e Function no Cloudflare Pages (<https://financas-app-t2l.pages.dev>)
- [x] Google OAuth de produção: URI de retorno, origens e tela de consentimento publicada ([ADR 0026](adr/0026-login-com-google.md)), com a política de privacidade em `/privacidade`
- [x] Sentry no front e na API, sem dados pessoais ([ADR 0034](adr/0034-relatorio-de-erros-com-sentry.md)), testado em produção
- [x] Backup diário do banco, criptografado, num repositório privado ([ADR 0035](adr/0035-backup-do-banco.md)), com restauração testada e monitor no Sentry ([docs/backup.md](backup.md))

## Fase 5 — Evolução e abertura ao público

- [x] Reforma do front mobile first ([ADR 0036](adr/0036-design-mobile-first.md))
  - [x] Skills: plugin `frontend-design` e a skill do projeto `financas-ui`
  - [x] Fundação visual: cor de marca (índigo), tokens semânticos, toques de 44 px, componentes do shadcn, ícones e manifesto, script de capturas
  - [x] Layout dos espaços: barra inferior no celular, menu lateral no desktop, `PeriodNav` em botões e estados de carregando, vazio e erro
  - [x] Página inicial no padrão novo e seletor de tema (Sistema, Claro, Escuro)
  - [x] Lançamentos: cartões, ações num menu, formulário em gaveta, confirmação ao excluir e toasts
  - [x] Painel: indicadores responsivos e destinos em cartões no celular
  - [x] Orçamento, Categorias, Membros e telas de login
  - [x] Seletor de espaço no cabeçalho (toda tela com o menu) e estado vazio sem ação repetida
  - [x] Gaveta acima do teclado virtual no celular
  - [x] Seletor de mês e ano na navegação de competência ("Mês atual" dentro dele)
- [x] Recorrências e parcelamentos ([ADR 0038](adr/0038-recorrencias-e-parcelamentos.md))
  - [x] API de recorrências: gerar ao abrir o mês, mudar e encerrar só os pendentes do mês atual em diante
  - [x] API de parcelamentos: todas as parcelas de uma vez, total ou valor da parcela, centavos na última, encerrar
  - [x] "Repetir" (Todo mês) no "Novo lançamento", selo nas linhas e "Encerrar recorrência" no menu
  - [x] API de valor variável: média dos 3 últimos efetivados, "estimado" até confirmar, total estimado no Painel
  - [x] Tela de valor variável: "Fixo | Variável", aviso "Estimado" e "Efetivar" pedindo o valor
  - [x] "Parcelado" no "Novo lançamento", selo "Parcela n/N" e "Encerrar parcelamento" no menu
  - [x] Tela "Recorrências" no Mais: listar, editar (só o que mudou) e encerrar
  - [x] "Tornar recorrente" no menu de um lançamento existente: criar a recorrência adotando o lançamento como o primeiro mês, sem duplicar (não aparece para um que já repete, uma parcela, um lançamento dividido ou uma parte)
  - [x] Vencimento no mês seguinte numa recorrência ou num parcelamento (visto em 2026-10-13 com a conta de luz: lançada em outubro, vence em 10/11; nota no [ADR 0038](adr/0038-recorrencias-e-parcelamentos.md))
    - [x] API: `dueMonthOffset` (0 ou 1) na recorrência e no parcelamento, usado em cada mês gerado e em cada parcela; mudá-lo recalcula os pendentes deste mês em diante; "Tornar recorrente" tira a distância da data do lançamento
    - [x] Tela: o formulário manda a distância da data digitada, Recorrências mostra "Vence dia 10 do mês seguinte" e a edição oferece "Mesmo mês / Mês seguinte"
  - [x] Editar e excluir um parcelamento (nota no [ADR 0038](adr/0038-recorrencias-e-parcelamentos.md))
  - [x] A parte de uma divisão repete a descrição do que foi dividido, sem o nome da pessoa ("Conta de luz", "Geladeira (3/10)"), e acompanha a edição da descrição nas partes pendentes (nota no [ADR 0052](adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md))
  - [x] Reembolso e Repasse fixos: marcados no banco (`split_role`), achados pela marca, sem renomear, arquivar ou excluir, e com o selo "Divisão" em Categorias (nota no [ADR 0052](adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md))
    - [x] API: a marca, a migração, a divisão pela marca, as rotas e a cópia recusando, a exportação
    - [x] Tela: o selo "Divisão" sem menu em Categorias
  - [x] Recorrência anual (IPVA, IPTU, anuidade; nota no [ADR 0038](adr/0038-recorrencias-e-parcelamentos.md))
    - [x] API: `intervalMonths` (1 ou 12) na recorrência, só o mês do ciclo gerado, "Tornar recorrente" anual, a frequência no lançamento e na exportação
    - [x] Tela: "Todo ano" no "Repetir" (2×2 no celular) e no "Tornar recorrente", o selo, a seção "Recorrentes" com a frequência e o próximo mês de uma anual, a coluna "Repete" na tabela e o total "Por ano" à parte
    - [x] API: `PATCH …/installments/:planId` (o que ele é, sempre, nas parcelas pendentes; os valores só sem parcela paga e sem divisão, refazendo as parcelas) e excluir de vez o que não tem parcela paga
    - [x] Tela: "Editar" no menu do parcelamento, "Excluir parcelamento" quando nada foi pago e "Encerrados e quitados"
- [x] O mesmo padrão nas outras telas: um cartão por item em Recorrências e na revisão da importação, faixas nas tabelas de Recorrências, um cartão por pessoa em Pessoas, cartões compactos em duas colunas em Categorias e Estabelecimentos, e o fundo de cartão nas listas de configuração (nota no [ADR 0036](adr/0036-design-mobile-first.md))
- [x] Tabela de Lançamentos com faixas alternadas e destaque ao passar o mouse, a situação embaixo da data (sem coluna própria) e a coluna "Onde / Meio" (nota no [ADR 0036](adr/0036-design-mobile-first.md))
- [x] Leitura de Lançamentos: o valor com sinal ("+ R$" em verde nas entradas, "− R$" nas saídas), "Pendente" só para quem não pode pagar, o resumo "Entradas / Saídas / Saldo previsto" no topo e um cartão por lançamento na lista (nota no [ADR 0036](adr/0036-design-mobile-first.md))
- [x] Ver Lançamentos e Recorrências como tabela, a partir de 1280 px ("Ver como: Lista | Tabela", lembrado no navegador; nota no [ADR 0045](adr/0045-largura-por-pagina-e-grade-do-painel.md))
  - [x] Lançamentos: Entradas e Saídas em tabelas alinhadas, ordenadas pela coluna clicada; o botão da linha vira "○ Pagar" / "○ Receber" (com contorno, também na lista) e o menu ganha "Marcar como pago / recebido" (nota no [ADR 0036](adr/0036-design-mobile-first.md)); o link ativo da barra lateral com contraste de texto e o axe também em 1280 px no script de capturas
  - [x] Recorrências: "Todo mês" e "Parcelamentos" em tabela (Descrição, Tipo, Categoria, Pessoa, Vence, Período e Valor; Descrição, Tipo, Categoria, Pessoa, Pagas, Falta e Total), as encerradas à parte e sem coluna de ações
- [x] Escolha de categoria com busca (sem depender de acentos) e "Mais usadas" dos últimos 6 meses (`recentUses` na lista de categorias)
  - [x] "Adicionar 'Nome'" no seletor de categoria do lançamento e da recorrência: criada ao salvar, com o tipo do lançamento; uma arquivada de mesmo nome volta
  - [x] Sugerir a categoria pela descrição, a partir dos lançamentos anteriores ([ADR 0053](adr/0053-estabelecimentos.md): preenche a categoria vazia com "Sugerida pelo histórico")
- [ ] Rateio de lançamentos e pessoas ([ADR 0042](adr/0042-pessoas-e-rateio.md))
  - [x] API: pessoas, lançamento ligado a uma pessoa, dividir um gasto e categoria Reembolso
  - [x] Tela: "Dividir com alguém" no novo lançamento, "A receber de / A pagar para", selos e excluir com as partes
  - [x] Página Pessoas (no Mais): saldos e os lançamentos de cada uma, de qualquer mês
  - [x] Membros do espaço compartilhado como pessoas (nota de 2026-10-12 no ADR 0042)
    - [x] API: criadas ao aceitar o convite e ao listar, ligando a pessoa de mesmo nome; `isMember` e `PERSON_IS_MEMBER`
    - [x] Tela: selos "Membro" e "Você" em Pessoas, e você fora das sugestões
  - [x] Pessoa e divisão em entradas, recorrências e parcelamentos ([ADR 0052](adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md))
    - [x] Seletor de pessoa como o de categoria: busca, "Membros" e "Pessoas", "Adicionar 'Nome'"
    - [x] Uma pessoa em "Todo mês" e "Parcelado" (API e tela)
    - [x] Dividir uma entrada: as partes viram saídas pendentes em Repasse
    - [x] Dividir um parcelamento: a parte de cada pessoa em cada parcela, criadas junto (API, depois tela)
    - [x] Dividir uma recorrência: a recorrência guarda a divisão e gera a parte de cada pessoa a cada mês; em % numa variável, acompanhando o valor real (API, depois tela)
  - [ ] Compartilhar um lançamento com quem usa o app, com aceite no espaço dela (ADR próprio; avaliado em 2026-10-18). Em vez de compartilhar um espaço para dividir um jantar, a parte da pessoa vira um pedido que ela aceita no Pessoal dela, escolhendo a categoria; o "pago" acompanha dos dois lados. A decidir no ADR:
    - o vínculo entre dois espaços (hoje isolados por RLS), em tabela própria, a pessoa vendo só a parte dela;
    - como ela fica sabendo (pedidos recebidos no app, e-mail ou os dois);
    - a ligação da pessoa do cadastro com a conta dela (hoje só membros têm);
    - o que sincroniza depois do aceite (sugestão: só o "pago" e o "excluído"; mudar valor ou descrição vira um pedido novo);
    - recusa e exclusão de um dos lados.
  - [ ] Divisão das contas da casa por percentual entre os membros (ADR próprio)
- [ ] **Visão geral dos espaços,** no Pessoal (avaliada em 2026-10-18; ADR curto ou nota): um cartão por espaço de que a pessoa participa, com o mês atual (entradas, saídas e saldo previsto), vencidos e pendências, o que ela tem a receber e a pagar ali e o link para o espaço; depois, também os pedidos de lançamento recebidos. Só junta o que ela já pode ver, lendo cada espaço no próprio contexto (como a cópia de categorias, [ADR 0048](adr/0048-copiar-categorias-entre-espacos.md)). Vem antes de compartilhar um lançamento.
- [x] **Estabelecimento** ([ADR 0053](adr/0053-estabelecimentos.md)): onde se comprou ou quem pagou ("Mercado A", "Netflix", "Empresa X"), um cadastro do espaço e um campo opcional em saídas e entradas, separado da categoria e da pessoa. Pessoa responde "com quem"; estabelecimento responde "onde". Usar Pessoa para lojas foi descartado: os saldos de Pessoas contariam uma compra pendente como dívida com a loja, as lojas apareceriam em "Dividir com alguém" e um lançamento não teria como ter loja e pessoa ao mesmo tempo.
  - [x] ADR: cadastro próprio (e não texto livre, subcategorias ou etiquetas), saídas e entradas, "Estabelecimento" na tela e `Merchant` no código, no glossário
  - [x] API: tabela `merchants` com RLS (nome único no espaço, arquivar em vez de excluir), `merchant_id` opcional em lançamentos, recorrências e parcelamentos, exportação de dados
  - [x] Tela: seletor no formulário (o mesmo componente do de pessoa), o estabelecimento na linha do lançamento e na busca
  - [x] Tela: página Estabelecimentos (no Mais) para renomear, arquivar, reativar e excluir os arquivados sem uso
  - [x] Análise por estabelecimento dentro de uma categoria (ex.: quanto foi para cada mercado)
  - [x] Coluna opcional "Estabelecimento" na planilha modelo (um nome novo vira estabelecimento ao importar; um arquivado volta; desfazer a importação não os apaga)
  - [x] Sugerir a categoria pelo estabelecimento, junto com a sugestão pela descrição (o estabelecimento vale mais; 12 meses de histórico; nunca troca uma categoria escolhida)
- [x] **Importação da fatura do cartão** ([ADR 0055](adr/0055-importacao-da-fatura-do-cartao.md)): o CSV da fatura do Nubank lido na tela Importar, com a data da compra, os apelidos de estabelecimento e as parcelas virando parcelamentos
  - [x] ADR: mês de referência da fatura, parcelas (casar ou criar o parcelamento, com a parcela inicial), apelidos pelo começo do título, "Data da compra" / "Data", aviso de fatura lançada inteira
  - [x] API: a data da compra nos lançamentos, na planilha modelo (coluna "Data") e na exportação
  - [x] Tela: a data no formulário, na linha e na tabela (coluna "Data" própria, escolhida na prévia)
  - [x] API: apelidos de estabelecimento e parcela inicial no parcelamento
  - [x] API: a data da compra no parcelamento, copiada para cada parcela e parte (nota no ADR)
  - [x] Tela: a parcela inicial e a data da compra no "Parcelado"
  - [x] Tela: apelidos em Estabelecimentos e no seletor
  - [x] API: a importação aceita parcelamentos, apelidos e a data
  - [x] O leitor do CSV do Nubank, sem tela (`parseNubankCsv` em `packages/shared`)
  - [x] API: a "Origem" digitada e o vencimento da fatura em cada importação, e quantos parcelamentos ela criou
  - [x] Tela: a origem "Fatura do cartão Nubank", o vencimento e a revisão com as regras da fatura
- [x] As partes de uma divisão vencem com o que foi dividido (lançamento, mês da recorrência ou parcela) e acompanham a mudança do vencimento; as pendentes já gravadas ganham o da origem pela migração (nota no [ADR 0052](adr/0052-divisao-em-entradas-recorrencias-e-parcelamentos.md))
- [x] Recorrências: uma encerrada mostra do primeiro ao último mês ("Janeiro a maio de 2026"), e não só "Até maio de 2026" (nota no [ADR 0038](adr/0038-recorrencias-e-parcelamentos.md))
- [x] "Beleza" entre as categorias padrão de saída dos espaços novos (pedido em 2026-10-17; os espaços existentes continuam com as suas, como no "Bônus", nota no [ADR 0024](adr/0024-espacos-membros-e-espaco-pessoal.md))
  - [x] Revisão da lista com o mercado (2026-10-18): "Beleza" vira "Cuidados pessoais", e entram "Presentes e doações" e "Pets" ("Viagens" fica como meta do orçamento)
- [x] **Meio de pagamento** ([ADR 0054](adr/0054-meio-de-pagamento.md)): como se pagou ou recebeu, numa lista fixa (Pix, Débito, Crédito, Dinheiro, Boleto, Transferência e Débito automático), em saídas e entradas. Contas e cartões com saldo e fatura ficam para um ADR próprio, se a necessidade aparecer.
  - [x] ADR: lista fixa (e não cadastro ou texto livre), sete meios, saídas e entradas, "Meio de pagamento" / "Meio de recebimento" na tela e `PaymentMethod` no código, no glossário
  - [x] API: enum e `payment_method` opcional em lançamentos, recorrências e parcelamentos (herdado por cada mês e parcela, nunca pelas partes), exportação; "Cartão de crédito" fora das categorias padrão dos espaços novos
  - [x] Tela: o campo em "Mais opções" e na edição da recorrência, o meio na linha, na tabela e na busca
  - [x] Sugestão pelo histórico (como a da categoria): o meio vazio vem do estabelecimento ou da descrição, com "Sugerido pelo histórico", sem trocar uma escolha feita à mão
  - [x] Meio "Vale-alimentação/refeição" (o vale do empregador, também o de um só estabelecimento) e "Bônus" entre as categorias padrão de entrada dos espaços novos (nota no [ADR 0024](adr/0024-espacos-membros-e-espaco-pessoal.md))
  - [x] Análise "Despesas por meio de pagamento" (ou "Entradas por meio de recebimento"), com os mesmos filtros das categorias e "Sem meio" por último
  - [x] Coluna opcional "Meio de pagamento" na planilha modelo (lida pelo rótulo ou por sinônimos comuns, um valor fora da lista vira aviso; a aba "Meios de pagamento" na planilha baixada)
- [x] Comparativos entre meses e gastos por categoria ao longo do tempo ([ADR 0037](adr/0037-analise-de-periodos.md))
  - [x] API: somas por competência, tipo e categoria (`/workspaces/:workspaceId/analysis`) e funções de análise em `packages/shared`
  - [x] Página "Análise": período, filtros e evolução mês a mês
  - [x] Gastos por categoria e categoria ao longo do tempo
- [x] Importação do `.xlsx` (com relatório de inconsistências, [ADR 0040](adr/0040-importacao-da-planilha.md))
  - [x] API: importação registrada, todos os lançamentos de uma vez, desfazer
  - [x] Planilha modelo: gerar no navegador, ler e relatório de inconsistências
  - [x] Tela "Importar planilha" no Mais: prévia por competência, editar e corrigir linhas, correspondência de categorias, desfazer
- [x] LGPD ([ADR 0041](adr/0041-termos-exportacao-e-exclusao-de-conta.md); a política de privacidade já existe em `/privacidade`, [ADR 0012](adr/0012-privacidade-lgpd.md))
  - [x] Termos de uso em `/termos`, aceite no cadastro e tela de aceite para contas existentes e o Google
  - [x] Exportação dos dados em JSON, na página `/conta` ("Minha conta", no menu da conta)
  - [x] Remover membros, sair de um espaço e excluir um espaço compartilhado (sem isso, a exclusão de conta ficaria bloqueada sem saída)
  - [x] Exclusão de conta com link por e-mail, em `/conta`
- [x] Domínio próprio, `financas.codelelis.com` ([ADR 0039](adr/0039-dominio-proprio.md))
  - [x] Redirecionar o endereço antigo e roteiro no deploy.md
  - [x] DNS no Cloudflare, domínio no Pages e variáveis de produção
  - [x] E-mail com o domínio verificado no Resend
  - [x] Exigir a verificação de e-mail no cadastro

## Fase 6 — Identidade visual

- [x] Decisão da identidade `<CodeLélis/> Finanças` ([ADR 0043](adr/0043-identidade-visual-codelelis.md))
- [x] Arquivos da marca: símbolo, logos, favicon, ícones do app e manifesto, derivados das artes aprovadas (a marca fora da licença MIT)
- [x] Tokens: paleta, tema escuro marinho, fonte Inter, raio e teste de contraste e de origem das cores (oficiais ou derivadas registradas)
- [x] Moldura do app: `BrandLogo`, a logo nas telas de login, o item ativo com barra azul
- [x] Marca do produto e moldura revista ([ADR 0044](adr/0044-marca-do-produto-e-moldura.md)): `[CL] Finanças` dentro do app, barra lateral de altura inteira no desktop (marca, espaço, seções e conta), o espaço no topo da página no celular e o rodapé com a assinatura CodeLélis
- [x] Login, cadastro e redefinir senha: botão para mostrar e ocultar a senha (`PasswordInput`)
- [x] Rodada de validação do login:
  - auditoria axe no script de capturas;
  - borda dos campos com 3:1;
  - "Aguardando o servidor…" ao enviar;
  - testes de teclado e autocomplete;
  - o "G" do Google no botão;
  - o rodapé na base da tela.
  - Centralizado no desktop, de propósito.
- [x] Painel ([ADR 0045](adr/0045-largura-por-pagina-e-grade-do-painel.md)):
  - coluna larga por página e grade de 2 colunas do xl em diante;
  - "Despesas e meta" vazio com ação ("Definir renda");
  - axe zerado no Painel: listas `<dl>`, os nomes do seletor de espaço, do de mês e dos meses (WCAG 2.5.3);
  - os indicadores ficam sem ícone, e a paleta dos gráficos continua a do ADR 0032.
- [x] Orçamento editado no Painel, num modal ([ADR 0046](adr/0046-orcamento-no-painel.md)):
  - a página saiu, e o endereço antigo leva ao Painel;
  - a renda líquida aparece em "Orçamento por destino";
  - "Despesas e meta" foi incorporado a esse bloco;
  - Análise passa a ser aba no celular.
- [x] **Orçamento real por destino** ([ADR 0047](adr/0047-orcamento-real-por-destino.md)):
  - **Duas bases:** Despesas é um % da renda líquida; os destinos de guardar são um % do disponível (créditos − despesas).
  - **Destinos personalizados,** cada destino de guardar com a sua categoria de débito. Um lançamento nela é uma aplicação.
  - **Orçamento vazio até o primeiro** ser salvo; depois cada mês herda o anterior.
  - [x] PR 1 (só acréscimos, o orçamento e o Painel seguem iguais): destinos (`budget_destinations`, rotas `/budget-destinations`), cada destino de guardar com a sua categoria, os padrão em todo espaço (os existentes pela migração) e a proteção das categorias de destino
  - [x] PR 2: percentuais por competência (`budget_shares`, copiados dos orçamentos atuais), o resumo com aplicações e as duas bases, e o "Resultado" substituído, com a API e o web juntos, porque muda o contrato. O Painel já mostra meta, aplicado, a aplicar e % realizado, e o modal tem os percentuais por destino e o "Definir orçamento" destacado.
  - [x] PR 3: "Aplicar" ("Registrar aplicação em …") em cada destino de guardar no Painel, com a categoria e o valor que falta para a meta; "Gerenciar destinos de guardar" no modal do orçamento (novo, renomear, arquivar e reativar); a categoria de destino marcada na tela de Categorias
  - [x] Arquivar um destino vale a partir da competência atual (os meses anteriores não mudam); categorias e destinos nunca usados podem ser excluídos (`inUse` nas listas; nota de 2026-10-09 no ADR 0047)
- [x] Lançamentos: etiquetas de receita e despesa ("Pago em" e "Recebido em" no lugar de "Efetivado em")
- [x] E-mails e textos com o nome CodeLélis Finanças
- [x] Revisão de todas as telas em claro e escuro, com a lista do axe zerada
  - [x] Lista do axe zerada: a Análise na coluna larga, com os totais em duas listas de definição, e os menus não modais
  - [x] Avaliação externa tela a tela, com um pacote de revisão (capturas, o que já foi feito e decidido, onde focar): Painel, Lançamentos, Análise, Recorrências, Pessoas, Importar, Membros, Minha conta, Convite e entrada
    - [x] Painel: o saldo explicado junto do número, uma frase de abertura em cada bloco do orçamento, "Agendado" e "Falta" no lugar de "A aplicar", e as metas de guardar fechando no centavo
    - [x] Lançamentos: busca por descrição, categoria ou pessoa; filtro por situação no endereço (o aviso de vencidos do Painel abre já filtrado); "Mais opções" no formulário; "Pago em" e "Recebido em"
    - [x] Análise: aplicações à parte do gasto (como no Painel), comparação com o período anterior, a diferença do mês tocado, "Saldo do mês" na legenda e "Filtros (2)" no celular
    - [x] Recorrências: total por mês (a parte variável como estimativa), o que falta de cada parcelamento (parcelas, valor e mês da última) e a regra do passado em duas frases curtas
    - [x] Pessoas: "Marcar como recebido/pago" no histórico (a mesma efetivação de Lançamentos), total a receber e a pagar, quem tem pendência primeiro e busca numa lista longa
    - [x] Importar: passos numerados, botão "Escolher planilha", resumo da revisão (o que entra, com créditos e débitos, e o que tem problema), filtro "Com problemas", nota de "tudo ou nada" e a revisão nas capturas
    - [x] Membros: o que cada acesso permite, os mesmos nomes de acesso em todo o app ("Pode editar" e "Só visualizar"), "Excluir espaço" numa área à parte e "Criar espaço compartilhado" no espaço pessoal
    - [x] Minha conta: a exportação explicada sem depender de "JSON", o próximo passo no bloqueio da exclusão e o contraste do link corrigido. Trocar nome, e-mail e senha e ver as sessões ficam para uma rodada própria, com ADR
    - [x] Gerenciar a conta (ADR 0049), parte 1: trocar o nome, trocar a senha (os outros aparelhos saem), criar uma senha numa conta do Google e ver e encerrar os aparelhos conectados
    - [x] Gerenciar a conta (ADR 0049), parte 2: trocar o e-mail, confirmado pelo novo endereço, com aviso ao antigo
    - [x] Convite e telas de entrada: o acesso do convite com o mesmo nome e texto de Membros, o que é um espaço, por que confirmar o e-mail e que a redefinição desconecta todos os aparelhos; capturas de "Esqueci minha senha", "Redefinir senha" e do convite
- [x] Carregamento com o símbolo CL animado (`components/brand-loader.tsx`, pedido em 2026-10-09):
  - **Onde:** nas telas de carregamento da página inteira: a abertura do app enquanto confere a sessão (que pode levar até um minuto com a API dormindo), Entrar e Cadastro, "/" e o convite. As listas continuam com esqueletos.
  - **Como:** a arte oficial animada como um todo, numa "respiração" suave de opacidade e escala, sem redesenhar nem recriar o CL em CSS (ADR 0043).
  - **Acessibilidade:** parada para quem pede menos movimento, e "Carregando…" só para leitores de tela.
  - **Depois de 3 s:** "Aguardando o servidor… isso pode levar até um minuto." abaixo do símbolo (o mesmo texto das listas e dos botões). O erro da abertura oferece "Tentar de novo".
- [x] **Vocabulário da interface** ([ADR 0051](adr/0051-vocabulario-da-interface.md)): os termos dos apps de finanças pessoais, um nome por conceito, e o código sem mudar
  - [x] Mensagens da API sobre destinos e pessoas aparecendo na tela, em vez do erro genérico
  - [x] ADR e glossário com a ponte entre a tela e o código
  - [x] Telas, toasts, mensagens da API e planilha modelo com os termos novos (a planilha antiga continua sendo lida), rótulos de tipo e situação em `packages/shared`, capturas e axe zerado
- [x] Lançamentos no celular: no fim da página, o botão fixo "Novo lançamento" cobre parte do link "Privacidade" do rodapé (os lançamentos ficam livres; visto nas capturas do ADR 0051). O layout reserva o espaço do botão abaixo do rodapé (`data-fab`), também na revisão da importação

**Ideias futuras:**

- **Página de apresentação do Finanças:** é para quem chega sem conta. Ela teria a arte grande, os recursos reais e capturas do app, e ficaria ligada ao `codelelis.com`. É o lugar de mostrar o produto; o login continua só com o formulário.
- [x] **Copiar categorias entre espaços** ([ADR 0048](adr/0048-copiar-categorias-entre-espacos.md)): "Copiar de outro espaço" na tela de Categorias. Você marca quais copiar; as de mesmo nome (sem diferenciar maiúsculas e acentos), as arquivadas e as de destinos do orçamento ficam de fora. Só servem de origem os espaços de que a pessoa participa, e só se grava num espaço em que ela edita.
  - [x] Tela de Categorias: busca, contagem por seção e "Nova categoria" num modal no topo
  - [ ] Oferecer a cópia ao criar um espaço
  - [ ] Copiar também os destinos do orçamento
