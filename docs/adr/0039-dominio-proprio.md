# 0039 — Domínio próprio: financas.codelelis.com

- **Status:** Aceita
- **Data:** 2026-10-06

## Contexto

Desde a fase 4, o app responde em `financas-app-t2l.pages.dev` ([ADR 0033](0033-topologia-e-limites-do-deploy.md)). Isso tem dois problemas:

- o endereço é difícil de lembrar;
- sem domínio verificado, o Resend só entrega e-mails ao dono da conta ([ADR 0022](0022-envio-de-email.md)). Verificação, redefinição de senha e convites não chegam a mais ninguém.

O dono comprou **codelelis.com** na Spaceship. O domínio vai servir também a outros projetos (blog, conteúdo de tecnologia, outros apps), então a raiz não deve ficar presa a este app.

O [ADR 0009](0009-hospedagem-gratuita.md) previa um `.com.br` no Registro.br, com `app.` e `api.`. O [ADR 0033](0033-topologia-e-limites-do-deploy.md) deixou em aberto se o proxy continuaria quando houvesse domínio.

## Opções consideradas

**Endereço do app:**

1. **A raiz, `codelelis.com`:** curto, mas ocupa o domínio que é de vários projetos.
2. **`app.codelelis.com`:** genérico demais quando houver outros apps.
3. **`financas.codelelis.com`:** diz o que é, e cada projeto ganha o seu subdomínio.

**DNS:**

1. **Manter na Spaceship:** um CNAME para o Pages e os registros do Resend à mão. Funciona para subdomínio, mas cada serviço novo é configuração manual.
2. **Nameservers no Cloudflare** (plano Free): o Pages liga o domínio sozinho (CNAME e certificado), e o Resend configura os seus registros com um clique.

**API:**

1. **Subdomínio `api.` apontando para o Render:** tira o salto da Function, mas exige CORS com credenciais e domínio personalizado no Render. Também muda a forma de confiar no IP do cliente ([ADR 0023](0023-rate-limit-autenticacao.md)).
2. **Manter o proxy da Pages Function:** um endereço só, nada muda no código nem no cookie.

## Decisão

- **O app fica em `financas.codelelis.com`.**
- **O DNS de codelelis.com fica no Cloudflare.** O domínio continua registrado na Spaceship; só os nameservers mudam.
- **O proxy continua** como no ADR 0033. Para o navegador, só existe `financas.codelelis.com`: a Function repassa `/api/*` ao Render. As variáveis passam a apontar para o novo endereço:
  - `WEB_ORIGIN` e `BETTER_AUTH_URL`, na API;
  - `VITE_API_URL`, no front.
- **E-mail:** o domínio verificado no Resend é **`codelelis.com`**, e o remetente é `nao-responda@codelelis.com`.
  - O plano gratuito permite um domínio só, e assim os próximos projetos podem enviar pelo mesmo.
  - Enviar não exige caixa de e-mail: o remetente é só o nome no envelope. Para receber num endereço do domínio, o Email Routing do Cloudflare (gratuito) encaminha para outra caixa.
- **O endereço antigo leva ao novo.** Com `VITE_CANONICAL_ORIGIN` definida (só na produção), o front abre e, se estiver em outro endereço, faz `location.replace` para o mesmo caminho no endereço oficial, sem renderizar nada (`apps/web/src/lib/canonical-origin.ts`).
  - Sem isso, quem tivesse o `*.pages.dev` salvo ficaria preso: depois da troca, a API só aceita login vindo do `WEB_ORIGIN` (`trustedOrigins`).
  - Prévias, desenvolvimento e testes não definem a variável, então não redirecionam.
  - Uma middleware no Pages faria o mesmo antes de carregar o front. Mas toda requisição, inclusive de arquivos estáticos, contaria nas 100.000 chamadas/dia das Functions.

## Consequências

- **Nenhuma regra do código depende do endereço.** A troca é feita nas variáveis do Render e do Pages, no cliente OAuth do Google (origem, URL de retorno, página inicial, política e domínio autorizado) e no Resend. O roteiro está em [docs/deploy.md](../deploy.md#7-domínio-próprio).
- **O `*.pages.dev` continua existindo** (o Pages sempre o mantém), mas só redireciona. As URLs dele no cliente do Google podem sair depois de alguns dias sem problemas.
- **Com o Resend verificado, os e-mails chegam a qualquer pessoa.** O próximo passo é exigir a verificação de e-mail no cadastro (`requireEmailVerification`, [ADR 0022](0022-envio-de-email.md)), num PR próprio.
- **Outros projetos** ganham subdomínios do mesmo DNS sem tocar neste app.

## Notas da troca (2026-10-06)

- **Feita no mesmo dia**, em produção:
  - `financas.codelelis.com` no ar;
  - login por e-mail e pelo Google;
  - o `pages.dev` redirecionando com o caminho preservado;
  - e-mails entregues a quem não é o dono da conta Resend.
- **Variável ignorada pelo build:** a `VITE_CANONICAL_ORIGIN` foi criada com um espaço no fim do nome. O painel e o log do build a mostravam, mas o build a descartava, e o redirecionamento não funcionava. A pista foi o nome do `index-….js` gerado, que não mudava entre os builds. O roteiro agora pede para digitar os nomes ([docs/deploy.md](../deploy.md)).
- **`PROXY_SECRET` trocado:** o valor antigo apareceu em capturas de tela durante a troca. O novo foi gerado no Render e guardado no Pages como _Secret_, e não mais como texto.
  - A prova de que os dois lados combinam é a tabela `rate_limits`: os logins depois da troca gravam o IP real (`no-trusted-ip` = falso).
- **E-mail:** o DKIM e o subdomínio `send` foram criados pelo Resend; o DMARC (`p=none`), à mão. Os primeiros e-mails caíram no spam, o esperado para um domínio novo, sem reputação.
