# 0048 — Copiar categorias entre espaços

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

Quem cria um espaço compartilhado (a casa, um negócio) recebe as categorias padrão ([ADR 0024](0024-espacos-membros-e-espaco-pessoal.md)). Muitas vezes, porém, já ajustou as categorias do espaço pessoal (criou "Pet", renomeou outras) e quer as mesmas no espaço novo. Até aqui, só dava para recriar uma por uma.

Copiar é a primeira operação que **lê de um espaço e grava em outro**. Todo o resto do app vive dentro de um espaço só: o `WorkspaceMemberGuard` confere a participação no espaço da rota ([ADR 0025](0025-guard-de-espaco-e-isolamento.md)), e o RLS limita cada consulta ao espaço do contexto ([ADR 0028](0028-row-level-security.md)). A decisão é como abrir essa exceção sem enfraquecer o isolamento.

## Opções consideradas

1. **O navegador lê a origem e cria uma a uma no destino,** com as rotas que já existem: nenhuma rota nova, mas dezenas de requisições, sem atomicidade, e a regra de duplicatas espalhada no cliente.
2. **Uma rota no destino que recebe a origem e os ids:** uma requisição; o servidor confere a participação na origem e aplica as regras.
3. **Modelos de categoria compartilhados entre espaços:** resolveria mais casos, mas cria uma tabela fora do isolamento por espaço e muda o modelo.

## Decisão

**Opção 2.** `POST /workspaces/:workspaceId/categories/copy` com `{ sourceWorkspaceId, categoryIds }`:

- **Permissão:** EDITOR no espaço de destino (o da rota, pelo guard de sempre) e **qualquer papel** na origem, porque ler as categorias já é permitido a todo membro. A participação na origem é conferida no serviço; sem ela, a resposta é 404, como para qualquer espaço alheio.
- **RLS:** a origem é lida com `forWorkspace(origem)`, e só depois de conferir a participação; o destino é gravado com `forWorkspace(destino)`. Nenhuma consulta vê os dois espaços ao mesmo tempo, e ids de outro espaço simplesmente não são encontrados.
- **O que é copiado:** só categorias **ativas**, com o mesmo nome e tipo. Ficam de fora:
  - as **arquivadas** da origem;
  - as que são de um **destino do orçamento** ([ADR 0047](0047-orcamento-real-por-destino.md)), que pertencem ao destino;
  - as que **já existem** no destino com o mesmo tipo e nome, ignorando maiúsculas e acentos ("agua" = "Água"), arquivadas também (a pessoa reativa a que já tem).
- **Resposta:** `{ copied, skipped }`. A gravação é um `createMany` só; se alguém criar o mesmo nome ao mesmo tempo, o índice único pula a repetida.
- **Na tela:** "Copiar de outro espaço" em Categorias abre um modal; a prévia usa a listagem que já existe da origem e marca as que já existem aqui.

Os destinos do orçamento não são copiados por esta rota: se fizer falta, é uma funcionalidade à parte.

## Consequências

- **Um espaço novo fica pronto em um passo,** sem recriar as categorias à mão.
- **O isolamento continua valendo:** a única leitura fora do espaço da rota passa por uma conferência explícita de participação e pelo RLS da origem. Uma próxima operação entre espaços deve seguir o mesmo desenho: conferir a participação na origem e ler e gravar cada espaço no seu próprio contexto.
- **A regra de nome igual** desta rota (sem acentos) é mais rígida que a do cadastro (só maiúsculas). Não há conflito: a cópia só deixa de criar quase-duplicatas.
