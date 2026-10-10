# Roadmap

Cada fase termina com algo funcionando e revisado. Decisões novas surgidas no caminho viram ADRs ([docs/adr](adr/README.md)).

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
  - [ ] "Tornar recorrente" no menu de um lançamento existente: criar a recorrência adotando o lançamento como o primeiro mês, sem duplicar
- [x] Escolha de categoria com busca (sem depender de acentos) e "Mais usadas" dos últimos 6 meses (`recentUses` na lista de categorias)
  - [ ] Sugerir a categoria pela descrição, a partir dos lançamentos anteriores
- [ ] Rateio de lançamentos e pessoas ([ADR 0042](adr/0042-pessoas-e-rateio.md))
  - [x] API: pessoas, lançamento ligado a uma pessoa, dividir um gasto e categoria Reembolso
  - [x] Tela: "Dividir com alguém" no novo lançamento, "A receber de / A pagar para", selos e excluir com as partes
  - [x] Página Pessoas (no Mais): saldos e os lançamentos de cada uma, de qualquer mês
  - [ ] Dividir um parcelamento: a parte de cada pessoa em cada parcela, criadas junto
  - [ ] Dividir uma recorrência: a recorrência guarda a divisão e gera a parte de cada pessoa a cada mês
  - [ ] Enviar a parte para quem usa o app, com aceite no espaço dela (ADR próprio)
  - [ ] Divisão das contas da casa por percentual entre os membros (ADR próprio)
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
- [ ] E-mails e textos com o nome CodeLélis Finanças
- [ ] Revisão de todas as telas em claro e escuro, com a lista do axe zerada
  - [x] Lista do axe zerada: a Análise na coluna larga, com os totais em duas listas de definição, e os menus não modais
  - [ ] Avaliação externa tela a tela, com um pacote de revisão (capturas, o que já foi feito e decidido, onde focar): Painel, Lançamentos, Análise, Recorrências, Pessoas, Importar, Membros, Minha conta, Convite e entrada
    - [x] Painel: o saldo explicado junto do número, uma frase de abertura em cada bloco do orçamento, "Agendado" e "Falta" no lugar de "A aplicar", e as metas de guardar fechando no centavo
    - [x] Lançamentos: busca por descrição, categoria ou pessoa; filtro por situação no endereço (o aviso de vencidos do Painel abre já filtrado); "Mais opções" no formulário; "Pago em" e "Recebido em"
    - [x] Análise: aplicações à parte do gasto (como no Painel), comparação com o período anterior, a diferença do mês tocado, "Saldo do mês" na legenda e "Filtros (2)" no celular
    - [x] Recorrências: total por mês (a parte variável como estimativa), o que falta de cada parcelamento (parcelas, valor e mês da última) e a regra do passado em duas frases curtas
    - [x] Pessoas: "Marcar como recebido/pago" no histórico (a mesma efetivação de Lançamentos), total a receber e a pagar, quem tem pendência primeiro e busca numa lista longa
    - [x] Importar: passos numerados, botão "Escolher planilha", resumo da revisão (o que entra, com créditos e débitos, e o que tem problema), filtro "Com problemas", nota de "tudo ou nada" e a revisão nas capturas
    - [x] Membros: o que cada acesso permite, os mesmos nomes de acesso em todo o app ("Pode editar" e "Só visualizar"), "Excluir espaço" numa área à parte e "Criar espaço compartilhado" no espaço pessoal
    - [x] Minha conta: a exportação explicada sem depender de "JSON", o próximo passo no bloqueio da exclusão e o contraste do link corrigido. Trocar nome, e-mail e senha e ver as sessões ficam para uma rodada própria, com ADR
- [x] Carregamento com o símbolo CL animado (`components/brand-loader.tsx`, pedido em 2026-10-09):
  - **Onde:** nas telas de carregamento da página inteira: a abertura do app enquanto confere a sessão (que pode levar até um minuto com a API dormindo), Entrar e Cadastro, "/" e o convite. As listas continuam com esqueletos.
  - **Como:** a arte oficial animada como um todo, numa "respiração" suave de opacidade e escala, sem redesenhar nem recriar o CL em CSS (ADR 0043).
  - **Acessibilidade:** parada para quem pede menos movimento, e "Carregando…" só para leitores de tela.
  - **Depois de 3 s:** "Aguardando o servidor… isso pode levar até um minuto." abaixo do símbolo (o mesmo texto das listas e dos botões). O erro da abertura oferece "Tentar de novo".

**Ideias futuras:**

- **Página de apresentação do Finanças:** é para quem chega sem conta. Ela teria a arte grande, os recursos reais e capturas do app, e ficaria ligada ao `codelelis.com`. É o lugar de mostrar o produto; o login continua só com o formulário.
- [x] **Copiar categorias entre espaços** ([ADR 0048](adr/0048-copiar-categorias-entre-espacos.md)): "Copiar de outro espaço" na tela de Categorias. Você marca quais copiar; as de mesmo nome (sem diferenciar maiúsculas e acentos), as arquivadas e as de destinos do orçamento ficam de fora. Só servem de origem os espaços de que a pessoa participa, e só se grava num espaço em que ela edita.
  - [x] Tela de Categorias: busca, contagem por seção e "Nova categoria" num modal no topo
  - [ ] Oferecer a cópia ao criar um espaço
  - [ ] Copiar também os destinos do orçamento
