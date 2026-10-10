# 0041 — Termos de uso com aceite, exportação dos dados e exclusão de conta

- **Status:** Aceita
- **Data:** 2026-10-07

## Contexto

O [ADR 0012](0012-privacidade-lgpd.md) deixou para a fase 5 o que falta para abrir o app ao público sob a LGPD:

- termos de uso com aceite registrado;
- exportação dos dados do titular;
- exclusão de conta.

A política de privacidade já existe em `/privacidade`. Até aqui, os pedidos do titular chegam pelo e-mail de contato.

Restrições do que já existe:

- **Cada espaço tem um único dono:** o convite só cria Editor ou Visualizador ([ADR 0027](0027-convites-por-email.md)). Apagar o usuário apaga as participações dele (`members` em cascata). Sem uma regra, um espaço compartilhado ficaria sem dono.
- **Login com o Google não passa pelo formulário de cadastro** ([ADR 0026](0026-login-com-google.md)): a conta nasce no retorno do Google, e não há uma caixa de aceite para marcar.
- **Já existem contas em produção** que nunca aceitaram termos.
- **Quem entra só com o Google não tem senha.** Pedir a senha para confirmar uma exclusão não serve para todo mundo.
- **Os backups ficam por 30 dias** ([ADR 0035](0035-backup-do-banco.md)): o dado excluído some do banco na hora, mas fica nos backups até eles vencerem.

## Opções consideradas

**Espaço próprio com outros membros, ao excluir a conta**

1. **Excluir o espaço junto** (o que o ADR 0012 previa): os outros membros perdem os dados sem aviso deles.
2. **Bloquear até resolver:** a exclusão só é liberada depois que a pessoa remove os membros ou exclui o espaço. Ninguém perde dados de surpresa.
3. **Transferir o dono antes de sair:** é o mais completo, mas exige um recurso novo.

**Formato da exportação**

1. **JSON completo:** a conta e os dados de cada espaço, legível por máquina (portabilidade, art. 18, V).
2. **JSON e a planilha modelo:** a planilha é mais amigável, mas dobra o que precisa ser mantido.
3. **Só a planilha modelo:** fica incompleta, porque orçamentos, recorrências e membros ficam de fora.

**Confirmação da exclusão**

1. **Digitar a senha:** não serve para quem só entra com o Google.
2. **Link por e-mail:** o recurso `deleteUser` do Better Auth envia o link e só apaga ao ser aberto. Funciona para os dois tipos de login, e quem pegar o aparelho desbloqueado não apaga a conta.

**Aceite de quem não passou pela caixa**

1. **Só no cadastro novo:** as contas existentes e o cadastro pelo Google ficam sem registro.
2. **Tela de aceite no próximo acesso:** quem não aceitou a versão atual vê "Aceitar e continuar" antes de entrar.

## Decisão

Escolhidos com o dono do projeto: **bloquear até resolver**, **JSON completo**, **link por e-mail** e **tela de aceite no próximo acesso**.

**Termos e aceite**

- **Página `/termos`:** pública, em pt-BR e com linguagem simples, ao lado de `/privacidade`. Ela tem a versão, que é a data da última mudança.
- **Constante `TERMS_VERSION`** em `packages/shared`. Mudar o texto de forma relevante muda a versão, e todos aceitam de novo.
- **`users` ganha duas colunas:** `terms_version` e `terms_accepted_at`, as duas nulas enquanto não houver aceite. Só a última aceitação fica guardada, sem histórico.
- **Cadastro por e-mail:** a caixa "Li e aceito os Termos de uso e a Política de privacidade" é obrigatória. A API recusa um cadastro sem a versão atual, e o aceite fica gravado junto com a conta.
- **Contas existentes e o Google:** `GET /me` informa a versão aceita. Se ela não for a atual, o front mostra a tela de aceite antes de qualquer página do app, e `POST /me/terms` registra o aceite.
- **O bloqueio fica no front:** a API registra o aceite, mas não recusa as outras rotas sem ele. Bloquear em todas as rotas complicaria cada teste e cada chamada, sem proteger dado nenhum: a pessoa só vê os próprios dados.

**Exportação**

- **`GET /me/export`** devolve um arquivo JSON, `financas-dados-AAAA-MM-DD.json`, com:
  - **a conta:** nome, e-mail, datas, versão dos termos aceita e os provedores de login (sem tokens nem hash de senha);
  - **os espaços de que a pessoa é dona, completos:** categorias, lançamentos, orçamentos, recorrências, parcelamentos, importações, membros e convites;
  - **os espaços em que a pessoa participa sem ser dona:** só o nome e o papel. Os dados desses espaços pertencem ao dono deles.
- **Os valores saem como no banco:** centavos inteiros, datas ISO e competência `AAAA-MM`. O arquivo traz o formato em `format` e a versão em `version`.
- **Nada do conteúdo vai para log** (ADR 0012), e a resposta não é guardada em cache (`Cache-Control: no-store`).

**Exclusão de conta**

- **Página `/conta`** (no menu da conta): mostra os dados da conta, "Baixar meus dados" e "Excluir minha conta".
- **Antes de enviar o link,** a API confere os espaços da pessoa:
  - se ela for dona de um espaço com outros membros ou convites pendentes, responde 409 com os nomes desses espaços, e a tela explica o que resolver;
  - fora isso, envia o e-mail com o link (Better Auth `deleteUser` com `sendDeleteAccountVerification`).
- **Ao abrir o link,** a mesma conferência roda de novo (`beforeDelete`), porque um membro pode ter entrado no meio do caminho. Passando, no mesmo fluxo:
  - os espaços de que ela é a única participante (o pessoal e os outros) são apagados, com todos os dados, em cascata;
  - as participações em espaços dos outros saem (`members` em cascata);
  - os convites pendentes para o e-mail dela são apagados;
  - sessões e contas de login saem em cascata;
  - importações e convites feitos por ela, em espaços dos outros, ficam sem autor (`SET NULL`, como já está no esquema).
- **O link vale 1 hora,** como o de redefinir a senha. Ele carrega um token, então entra em `TOKEN_SEGMENTS` (ADR 0034) e nunca vai para log.
- **Os backups não são editados:** o dado excluído some deles quando vencem, em até 30 dias. A política de privacidade passa a dizer isso.

## Consequências

- A LGPD fica coberta nos três pedidos que o app consegue atender sozinho: acesso e portabilidade (exportação), eliminação (exclusão) e aceite registrado. Correção já existe, porque a pessoa edita os próprios dados.
- **Transferir o dono de um espaço continua faltando.** Até lá, quem quer sair de um espaço compartilhado remove os membros antes. Se isso incomodar, a transferência vem num ADR próprio.
- **O texto dos termos foi escrito sem revisão jurídica.** Ela continua recomendada antes de divulgar o app amplamente.
- Cada tabela nova com dados do usuário precisa entrar na exportação, e o teste da exportação confere isso.
- **A entrega se divide em três PRs:**
  - termos com aceite (cadastro, tela de aceite, `/termos`);
  - exportação;
  - exclusão de conta e página `/conta`.

## Nota (exportação, 2026-10-07)

- **A página `/conta` chegou com a exportação,** e não com a exclusão: o botão "Baixar meus dados" precisava de um lugar. Ela abre pelo item "Minha conta" do menu da conta. A exclusão entra nela no próximo PR.
- **O arquivo também traz as sessões abertas,** com o IP e o navegador que o app guarda por segurança. Esses dados são da pessoa, e a política de privacidade os menciona.
- **Uma tabela nova não fica de fora por esquecimento:** um teste lê do banco toda tabela com `workspace_id` e falha se ela não estiver em `EXPORTED_TABLES` (`apps/api/src/account/data-export.service.ts`).
- **O download passa pelo `fetch`, e não por um link direto.** A tela mostra "Preparando o arquivo…" enquanto ele é montado. Um erro aparece como aviso, em vez de baixar um arquivo com a mensagem de erro.

## Nota (remover membros e excluir espaço, 2026-10-07)

**A regra "bloquear até resolver" precisava de um jeito de resolver.** Até aqui, o app não removia membros nem excluía espaços: só cancelava convites. Então entraram, antes da exclusão de conta:

- `DELETE /workspaces/:workspaceId/members/:userId`: o dono remove qualquer outra pessoa, e qualquer outro membro pode sair sozinho. O dono nunca sai (`OWNER_STAYS`), porque cada espaço tem um único dono. Os lançamentos de quem sai continuam no espaço, que é o dono deles.
- `DELETE /workspaces/:workspaceId`: só o dono, e nunca no espaço pessoal (`PERSONAL_WORKSPACE`). Apaga o espaço e tudo o que há nele em cascata, inclusive as tabelas com RLS: a cascata de chave estrangeira não passa pelas políticas.
- **Na página Membros:**
  - o dono vê "Remover" em cada outra pessoa;
  - um membro que não é o dono vê "Sair" na própria linha;
  - o dono de um espaço compartilhado vê "Excluir espaço", que lembra de baixar os dados antes.

  As três ações pedem confirmação, nomeando a pessoa ou o espaço.

Os termos de uso já diziam que o dono pode remover membros a qualquer momento. Agora o app faz isso.

## Nota (exclusão de conta, 2026-10-07)

**O link do e-mail abre uma página do app, não o callback do Better Auth.** O callback (`GET /delete-user/callback`) exigiria uma sessão aberta no navegador que abriu o e-mail, que muitas vezes é o do celular, sem login. Ele também excluiria a conta com um único toque. Por isso, o link leva a `/conta/excluir?token=…`, uma página protegida pelo login: quem chega sem sessão entra e volta. A página pede mais um clique e então envia `POST /api/auth/delete-user { token }`, que o Better Auth aceita e que exclui na hora.

**As verificações rodam duas vezes:**

- **ao pedir o link:** um hook antes de `/delete-user` responde 409 `OWNS_SHARED_WORKSPACES`, com os nomes dos espaços, e nenhum e-mail sai;
- **ao usar o link:** a mesma verificação roda de novo em `beforeDelete`, porque alguém pode ter entrado num espaço nesse meio-tempo.

`GET /me/deletion` lista esses espaços para a tela, com links para resolvê-los.

**O que `beforeDelete` faz,** numa transação, antes de o Better Auth apagar o usuário:

- exclui os espaços em que só a pessoa participa, inclusive o pessoal;
- apaga os convites pendentes para o e-mail dela;
- marca como "Saiu" (`LEFT`) os convites aceitos que a levaram a espaços de outras pessoas.

Sessões, contas de login e participações saem em cascata com o usuário.

**Outros pontos:**

- O pedido do link tem limite próprio por IP: 3 a cada 5 minutos, como as outras rotas que enviam e-mail.
- O token fica na query string, que nunca vai para o Sentry (`redactUrl` descarta a query inteira). Por isso, `TOKEN_SEGMENTS` não precisou mudar.

## Nota (revisão antes do uso real, 2026-10-10)

Antes de começar a usar o app de verdade, os textos legais e a segurança foram revisados contra o que o app faz.

**Termos de uso (versão `2026-10-10`, que pede novo aceite):**

- O nome passa a ser "CodeLélis Finanças", mantido por Diego Lélis.
- Idade mínima: 18 anos, ou menos com a autorização dos pais ou responsáveis. É o comum em apps financeiros e evita tratar dados de crianças, que têm regras mais rígidas na LGPD.
- Uma seção nova, "Dados de outras pessoas": quem convida ou cadastra pessoas usa o nome e o e-mail delas só para organizar as finanças e cadastra só o necessário.

**Política de privacidade:**

- Diego Lélis é identificado como o controlador, como a LGPD pede.
- Passam a constar:
  - as pessoas cadastradas ([ADR 0042](0042-pessoas-e-rateio.md)), das quais só o nome é guardado;
  - recorrências, parcelamentos e destinos de guardar;
  - as importações: a planilha é lida no navegador, e o servidor guarda só os lançamentos e um registro da importação.
- A lista de e-mails da conta fica completa.
- O armazenamento no navegador é descrito: o cookie da sessão, o cookie temporário do login com o Google, o tema e o último espaço.
- As sessões terminam depois de 7 dias sem uso.
- Os membros de um espaço veem também o nome e o e-mail uns dos outros.
- O GitHub entra como fornecedor, porque guarda os backups criptografados ([ADR 0035](0035-backup-do-banco.md)).
- A base legal é a execução do serviço (art. 7º, V), e os registros de segurança se apoiam no legítimo interesse (art. 7º, IX).
- Quem foi cadastrado como pessoa na conta de outra pessoa pode pedir acesso ou exclusão pelo e-mail de contato.

**Segurança:**

- **Cabeçalhos do site:** `apps/web/public/_headers`, aplicado pela Cloudflare Pages.
  - Uma CSP que só libera o próprio site e o envio de erros ao Sentry. Estilos inline continuam liberados, porque diálogos e avisos os definem durante o uso.
  - `frame-ancestors 'none'` e `X-Frame-Options: DENY`: nenhum outro site pode mostrar o app dentro de um quadro (clickjacking).
  - HSTS de 1 ano e uma `Permissions-Policy` que desliga câmera, microfone, localização e pagamentos.
- **Zod sem `eval`:** o Zod roda no navegador com `jitless`. Sem isso, o teste que ele faz para saber se `eval` existe apareceria como violação da CSP.
- **A API deixa de se anunciar:** o cabeçalho `X-Powered-By: Express` foi desligado.
- **`shadcn` virou dependência de desenvolvimento:** é uma ferramenta de linha de comando. Os alertas do `pnpm audit` que restam vêm do `mysql2` e do `deepmerge-ts`, puxados pelo Prisma e pelo Better Auth, e nenhum deles roda no app: o banco é Postgres, e o `deepmerge-ts` só lê a configuração do Prisma. Eles somem quando essas bibliotecas atualizarem.
- **Fica para depois:** a verificação em duas etapas e o bloqueio de senhas vazadas. São melhorias, não falhas encontradas.
