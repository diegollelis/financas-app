# 0025 — Guard de espaço, papéis e testes de isolamento

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

O [ADR 0008](0008-multi-tenancy-por-espaco.md) definiu as regras de acesso:

- toda rota de negócio fica sob `/workspaces/:workspaceId/...`;
- um guard confere se o usuário é membro do espaço e se o papel dele permite a operação;
- os repositórios sempre filtram por `workspace_id`;
- quem é de fora recebe 404.

Faltava implementar isso de um jeito que cada recurso novo da fase 3 (categorias, lançamentos, orçamento) reaproveite sem esquecer nenhuma parte. Isso equivale ao `xFilial()` do Protheus: se uma consulta esquecer o filtro, aparecem dados de outro espaço.

## Opções consideradas

**Onde checar o acesso**

1. **Em cada serviço**: cada método busca o membro e decide. É fácil esquecer em algum.
2. **Guard do Nest na rota**: a checagem acontece antes do controller, e o serviço recebe um espaço já validado.

**Resposta para papel insuficiente**

1. **404**, como para quem é de fora.
2. **403**: a pessoa já é membro e sabe que o espaço existe, então não há o que esconder, e a resposta ajuda a tela a explicar o motivo.

## Decisão

- **`WorkspaceMemberGuard`** (`apps/api/src/workspaces/workspace-member.guard.ts`): lê `:workspaceId`, busca o vínculo (espaço + usuário logado) e põe `{ workspaceId, role, isPersonal }` na requisição.
  - **404** quando o usuário não é membro, quando o espaço não existe e quando o id nem é um UUID. As três situações respondem igual, para que ninguém de fora descubra que um espaço existe.
  - **403** quando o papel não alcança o mínimo exigido.
- **`@WorkspaceScoped()`**, um único decorator no controller que aplica, em ordem: sessão (401), membro (404) e papel (403), e documenta as respostas no Swagger.
- **`@RequireRole('EDITOR' | 'OWNER')`** na rota define o papel mínimo, na hierarquia `VIEWER < EDITOR < OWNER` (`hasRole` no shared, que o front também vai usar para esconder botões). Sem o decorator, qualquer membro passa.
- **`@CurrentMembership()`** entrega o vínculo ao controller. **Os serviços recebem o `workspaceId` já validado, e toda consulta filtra por ele.** Um serviço nunca aceita um id de espaço vindo direto do cliente.
- **Primeiras rotas sob o guard:** `GET /workspaces/:id`, `PATCH /workspaces/:id` (renomear, só o `OWNER`) e `GET /workspaces/:id/members`. Excluir espaço fica para quando houver dados e uma tela de confirmação.
- **Teste de isolamento obrigatório por recurso:** `expectHiddenFromOutsiders(t, workspaceId, routes)` (`apps/api/test/isolation.ts`) cadastra uma pessoa de fora e exige 404 em **todas** as rotas listadas. Cada recurso novo acrescenta as suas rotas a uma lista desse tipo. O teste foi verificado: removendo o guard, ele falha.

## Consequências

- Um recurso novo da fase 3 segue o roteiro:
  1. controller com `@Controller('workspaces/:workspaceId/<recurso>')` e `@WorkspaceScoped()`;
  2. `@RequireRole('EDITOR')` nas rotas que alteram dados;
  3. serviço que recebe `membership.workspaceId` e filtra todas as consultas por ele;
  4. teste com `expectHiddenFromOutsiders` cobrindo todas as rotas.
- A disciplina de "toda consulta filtra por `workspace_id`" ainda depende de revisão e dos testes. O RLS do PostgreSQL (item de estudo da fase 2) é a segunda barreira, para quando um filtro escapar.
- Cada requisição a um espaço faz uma consulta a mais (o vínculo). Ela é feita por índice único (`workspace_id`, `user_id`), então é barata.
