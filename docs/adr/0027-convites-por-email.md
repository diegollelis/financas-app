# 0027 — Convite de membros por e-mail

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

Espaços compartilhados ([ADR 0024](0024-espacos-membros-e-espaco-pessoal.md)) só fazem sentido se o dono puder trazer outras pessoas. Um convite é, na prática, uma **credencial temporária**: quem tem o link entra no espaço. Por isso as decisões aqui são, na maior parte, de segurança. O que precisava ser decidido:

- o que guardar no banco;
- quem pode aceitar o convite;
- com que papel se entra;
- como evitar abuso (spam de convites).

## Opções consideradas

**Quem pode aceitar**

1. **Qualquer pessoa logada com o link**: simples, mas um link encaminhado, vazado ou exposto num print dá acesso a qualquer um.
2. **Só quem está logado com o e-mail convidado**: o link sozinho não basta; é preciso também ter a conta daquele e-mail.

**Papel no convite**

1. Qualquer papel, inclusive `OWNER`.
2. **Só `EDITOR` ou `VIEWER`**: um convite errado nunca entrega o controle total do espaço. Promoção a dono fica para outro passo.

## Decisão

- **Tabela `invitations`:** `workspace_id`, `email` (minúsculo), `role`, `token_hash`, `invited_by_id`, `expires_at`, `accepted_at`.
  - O **token** (32 bytes aleatórios) existe só no link do e-mail. O banco guarda o **SHA-256** dele, então um banco vazado não traz links que funcionem.
  - Um convite é **pendente** enquanto não foi aceito e não venceu (**7 dias**).
- **Rotas do dono** (`@WorkspaceScoped()` + `@RequireRole('OWNER')`, [ADR 0025](0025-guard-de-espaco-e-isolamento.md)):
  - `POST /workspaces/:id/invitations` convida e envia o e-mail;
  - `GET /workspaces/:id/invitations` lista os pendentes;
  - `DELETE /workspaces/:id/invitations/:invitationId` cancela. A busca filtra pelo espaço também: um id de convite de outro espaço dá 404.
- **Regras ao convidar** (erros 409 com `code`):
  - não se convida para o espaço pessoal (`PERSONAL_WORKSPACE`);
  - não se convida quem já é membro (`ALREADY_MEMBER`);
  - no máximo **20 pendentes por espaço** (`TOO_MANY_INVITATIONS`), para o convite não virar ferramenta de spam;
  - convidar de novo o mesmo e-mail **substitui** o convite anterior, e o link antigo para de funcionar.
- **Rotas do link** (`/invitations/:token`):
  - `GET` é **público** e mostra quem convidou, para qual espaço e com que papel, para a página explicar o convite antes do login. O token é o segredo, e adivinhá-lo é inviável;
  - `POST .../accept` exige sessão **com o mesmo e-mail do convite**; sem isso, responde 403 `EMAIL_MISMATCH`.
- **Ao aceitar:**
  - a marcação de "aceito" é atômica (`UPDATE ... WHERE accepted_at IS NULL`), então o link vale **uma vez**, mesmo com cliques simultâneos;
  - quem já era membro **mantém o papel**, e um dono nunca é rebaixado;
  - o e-mail fica **confirmado**, porque o link chegou na caixa da pessoa.
- **E-mail** em segundo plano, como os da autenticação ([ADR 0022](0022-envio-de-email.md)): uma falha vai para o log sem o conteúdo, e o dono pode convidar de novo. O assunto leva nomes digitados por usuários, então é reduzido a uma linha (sem quebras que injetem cabeçalhos), e o HTML escapa os nomes.

- **No front:**
  - **`/espacos/:id`** mostra os membros. Num espaço compartilhado, o dono vê também o formulário de convite ("Pode editar" ou "Só visualizar") e os convites pendentes, com o botão de cancelar. No espaço pessoal, a página explica que ele não é compartilhado. A página inicial ganhou links para os espaços e o formulário "Criar espaço".
  - **`/convites/:token`** fica fora das proteções de rota e mostra o convite antes de pedir login. Quem não está logado vê os botões "Entrar" e "Criar conta". Quem está com outro e-mail é avisado e pode sair. Quem está com o e-mail certo vê "Aceitar convite" e, ao aceitar, vai para o espaço.
- **Volta após o login (`?voltar=`):** o `RequireAuth` manda para `/entrar?voltar=<página>`, e o `GuestOnly` leva a pessoa de volta depois do login, do cadastro ou do Google. Os links entre login e cadastro mantêm o parâmetro. Só são aceitos **caminhos internos**: `//site.com`, `/\site.com` ou URLs completas viram `/`, para que um link malicioso não use o nosso login para mandar alguém a outro site (_open redirect_, comum em phishing).

## Consequências

- Faltam a remoção de membro, a saída do espaço e a promoção a dono. Com elas vem a regra de que todo espaço tem ao menos um `OWNER` ([modelo](../dominio/modelo.md)).
- Convites aceitos ficam na tabela como histórico (`accepted_at`). Uma limpeza periódica de convites vencidos pode vir depois, se a tabela crescer.

## Nota (status dos convites, 2026-10-07)

A lista de convites do dono deixou de mostrar só os pendentes. Agora ela traz os 30 mais recentes, cada um com o status (`PENDING`, `ACCEPTED` ou `EXPIRED`) e a data do aceite. Antes, um convite aceito sumia da lista sem aviso. Na página Membros:

- o convite pendente pode ser cancelado;
- o expirado pode ser apagado da lista;
- o aceito fica, como registro de como a pessoa entrou.

## Nota (aceite em um passo, 2026-10-07)

**O problema:** quem abria o convite sem sessão clicava em "Entrar", entrava e voltava ao convite, e aí precisava clicar em "Aceitar convite". Parecia que tinha aceitado duas vezes.

**Como ficou:**

- Os botões passaram a dizer "Entrar e aceitar" e "Criar conta e aceitar".
- A volta do login, do cadastro, do Google ou da confirmação do e-mail traz `?aceitar=1`, e a página aceita sozinha ao chegar.
- A regra não mudou: só a conta do e-mail convidado aceita. Com outra conta, a página explica e não aceita nada.
- Quem abre o link já com sessão continua vendo o botão, porque ali não houve clique antes.
- Uma conta que ainda não aceitou os termos ([ADR 0041](0041-termos-exportacao-e-exclusao-de-conta.md)) vê os termos antes de entrar no espaço, e não depois.

## Nota (remoção registrada no convite, 2026-10-07)

**O problema:** ao remover um membro, o convite que o trouxe continuava como "Aceito".

**Como ficou:**

- `invitations` ganhou `removed_at` e `left_on_own`, gravados junto com a remoção do membro, na mesma transação.
- O status passa a ser `REMOVED`, quando o dono removeu a pessoa, ou `LEFT`, quando ela saiu sozinha.
- A tela mostra o aceite e o fim com data e hora, no horário de São Paulo: "Aceito em 10/09/2026 às 10:05" e "Removido em 30/09/2026 às 18:40" (ou "Saiu em …").
- Esses convites são registro: não podem ser cancelados nem apagados.
- A exportação de dados ([ADR 0041](0041-termos-exportacao-e-exclusao-de-conta.md)) inclui os dois campos.
