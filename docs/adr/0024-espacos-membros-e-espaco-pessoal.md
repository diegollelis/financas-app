# 0024 — Espaços, membros e o espaço pessoal

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

O [ADR 0008](0008-multi-tenancy-por-espaco.md) definiu que os dados pertencem ao **Espaço** e que o acesso passa por **Member** (`OWNER`, `EDITOR`, `VIEWER`). Faltava decidir:

- como o espaço pessoal nasce;
- se ele é um espaço como os outros;
- como garantir que ele exista para todo usuário, inclusive os que já existiam;
- como a API valida o corpo das próprias rotas, agora que surgiu a primeira rota de negócio com entrada (`POST /workspaces`).

O Better Auth oferece um _hook_ "depois de criar usuário", mas ele roda **depois** de a transação do cadastro terminar. Se a criação do espaço falhar, o usuário já existe e fica sem espaço.

## Opções consideradas

**O espaço pessoal**

1. **Um espaço como outro qualquer**, só com o nome "Pessoal": flexível, mas abre casos difíceis, como o usuário que exclui ou abandona todos os espaços e fica sem nenhum.
2. **Espaço especial** (`is_personal`): é só do usuário, nunca é compartilhado nem excluído. Para dividir finanças, cria-se outro espaço.

**Garantir um espaço pessoal por usuário**

1. **Só o _hook_ do cadastro**: se ele falhar, o usuário fica sem espaço.
2. **Criação idempotente** ("garanta que existe"), chamada pelo _hook_ e de novo na listagem, com proteção contra duas criações simultâneas.

## Decisão

- **Tabela `members`** (`workspace_id`, `user_id`, `role`), única por espaço + usuário, com o papel num `enum` do Postgres (`workspace_role`). No shared, os papéis são um `z.enum` (sem `enum` do TypeScript, [ADR 0015](0015-shared-como-codigo-fonte.md)). Apagar um usuário ou um espaço apaga os vínculos (`ON DELETE CASCADE`).
- **Espaço pessoal especial:** coluna `workspaces.is_personal`, nome **"Pessoal"**, papel `OWNER`. As regras "não pode ser excluído nem receber membros" entram nas rotas de exclusão e de convite, quando elas existirem.
- **`ensurePersonalWorkspace(userId)` idempotente** no `WorkspacesService`:
  - chamado pelo _hook_ `databaseHooks.user.create.after` do Better Auth, que vale para qualquer forma de cadastro, inclusive o Google no futuro;
  - chamado de novo em `GET /workspaces` quando o espaço pessoal falta;
  - roda numa transação que começa com `SELECT ... FOR UPDATE` na linha do usuário. Chamadas simultâneas para o mesmo usuário esperam umas pelas outras (como um _lock_ de registro no Protheus), e só uma cria o espaço;
  - uma falha no _hook_ só vai para o log, sem derrubar o cadastro.
- **Migração de dados:** a migração `add_members` cria o espaço pessoal para os usuários que já existiam, usando `uuidv7()`, nativo do PostgreSQL 18.
- **Rotas:** `GET /workspaces` lista os espaços do usuário (o pessoal primeiro, depois por nome) com o papel dele em cada um. `POST /workspaces` cria um espaço compartilhado, e quem cria vira `OWNER`. As rotas por espaço (`/workspaces/:workspaceId/...`) e o guard de membro são o próximo passo.
- **Validação das rotas do Nest:** um `StandardSchemaValidationPipe` global com os schemas do shared (`@Body({ schema })`). O erro tem o mesmo formato das nossas validações no Better Auth: `code: 'INVALID_INPUT'`, a primeira mensagem (em pt-BR) e a lista `issues`.
- **`AuthModule` global**, para que todo módulo de negócio use o `SessionGuard` sem importá-lo. Importar de volta criaria uma dependência circular, porque o `AuthModule` usa o `WorkspacesService`.

## Consequências

- O teste de concorrência só prova o _lock_ porque abre as conexões do pool antes. Sem isso, a primeira chamada termina antes de as outras conseguirem conexão e o teste passaria mesmo sem o _lock_. Isso foi verificado: removendo o `FOR UPDATE`, o teste falha com 10 espaços pessoais.
- Apagar um usuário apaga os vínculos dele, mas os espaços compartilhados em que ele era o único membro ficam órfãos. A exclusão de conta (LGPD, fase 5) precisa tratar isso: transferir a posse ou excluir esses espaços.
- A migração de dados depende de `uuidv7()`. O banco de produção (Neon) precisa ser PostgreSQL 18 ou mais novo.

## Nota (padrões genéricos, 2026-10-10)

As categorias padrão de um espaço novo vinham da planilha pessoal de origem: 14 de crédito e 26 de débito, como PLR, Lote, Inglês e IPVA. Antes da 1.0.0 ([ADR 0050](0050-versionamento.md)), elas foram trocadas por uma lista genérica, porque o app é para outras pessoas também. São 5 de crédito e 13 de débito, listadas em `DEFAULT_CATEGORIES` e em [modelo.md](../dominio/modelo.md#categorias-padrão). Cada pessoa cria as categorias da sua vida. Os espaços criados antes continuam com as categorias que receberam, e não houve migração.

## Nota ("Bônus" entre os padrões, 2026-10-15)

- **Os espaços novos recebem "Bônus"** entre as categorias de entrada, logo depois de "Salário": o que o empregador paga além do salário (PLR, gratificação, prêmio). "Renda extra" fica para o que vem de fora (freela, venda).
- **Os espaços existentes ficam como estão**, como na saída de "Cartão de crédito" ([ADR 0054](0054-meio-de-pagamento.md)). Criar "Bônus" neles impediria renomear uma categoria antiga (como "PLR", da lista de origem) para esse nome, que é o caminho para o histórico inteiro passar a se chamar Bônus.

## Nota ("Beleza" entre os padrões, 2026-10-18)

- **Os espaços novos recebem "Beleza"** entre as categorias de saída, logo depois de "Saúde": salão, barbeiro, manicure, cosméticos, que antes acabavam em "Saúde" ou em "Compras".
- **Os espaços existentes ficam como estão,** pelo mesmo motivo do "Bônus": criar a categoria neles impediria renomear uma antiga para esse nome. Quem quiser cria "Beleza" pela tela, ou pelo "Adicionar 'Beleza'" no formulário do lançamento.

## Nota (a lista padrão comparada com o mercado, 2026-10-18)

A lista de saídas foi comparada com três referências: os grupos de despesa da POF 2017-2018 do IBGE, a lista padrão do Mint (a taxonomia da MX, a mais copiada pelos apps de finanças) e o que apps e blogs brasileiros citam como categorias comuns (as listas do Mobills e do Organizze não estão publicadas).

- **A base já batia:** moradia e contas da casa, mercado e restaurantes, transporte, saúde, educação, lazer, compras e impostos aparecem em todas as referências.
- **"Beleza" vira "Cuidados pessoais",** o nome do mercado (Personal Care no Mint, "higiene e cuidados pessoais" na POF), que cobre também higiene e barbeiro. Um espaço criado entre os dois deploys fica com "Beleza", que pode ser renomeada.
- **Entram "Presentes e doações" e "Pets":** aparecem em quase todas as listas e são gastos que hoje cairiam em "Lazer" ou "Outros".
- **"Viagens" também aparece em quase todas, mas fica de fora como categoria:** viagem é algo para o qual se guarda, e cada meta de guardar do orçamento cria a sua categoria de mesmo nome ([ADR 0047](0047-orcamento-real-por-destino.md)). Com "Viagens" entre as padrão, criar a meta "Viagens" seria recusado ("Já existe uma categoria de saída com esse nome"), e ela é uma das metas mais comuns (a planilha de origem tinha um percentual para viagens). Quem não usa metas cria a categoria pelo "Adicionar 'Viagens'".
- **Ficam de fora** "Vestuário" (os apps a põem em compras, e a fatia dela no gasto vem caindo), "Filhos" e "Seguros" (dependem da vida de cada um e se criam em segundos com "Adicionar 'Nome'"). As entradas não mudam.
- **Os espaços existentes ficam como estão,** pelo motivo do "Bônus".
