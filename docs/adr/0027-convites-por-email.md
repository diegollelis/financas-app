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

## Consequências

- O front (próximo passo) precisa de:
  - uma página do espaço com os membros e o formulário de convite;
  - a página `/convites/:token`;
  - a volta ao convite depois do login ou do cadastro.
- Faltam a remoção de membro, a saída do espaço e a promoção a dono. Com elas vem a regra de que todo espaço tem ao menos um `OWNER` ([modelo](../dominio/modelo.md)).
- Convites aceitos ficam na tabela como histórico (`accepted_at`). Uma limpeza periódica de convites vencidos pode vir depois, se a tabela crescer.
