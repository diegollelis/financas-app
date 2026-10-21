# 0049 — Gerenciar a conta: nome, senha, e-mail e aparelhos conectados

- **Status:** Aceita
- **Data:** 2026-10-10

## Contexto

"Minha conta" mostrava o nome e o e-mail, baixava os dados e excluía a conta ([ADR 0041](0041-termos-exportacao-e-exclusao-de-conta.md)), mas não deixava mudar nada. A avaliação externa da tela pôs isso em primeiro lugar: num app que guarda finanças, a pessoa espera trocar a senha, corrigir o nome ou o e-mail e ver em que aparelhos a conta está aberta.

O Better Auth ([ADR 0007](0007-autenticacao-better-auth.md)) já traz essas operações, algumas desligadas. A decisão é quais ligar, com que regras de segurança, e o que fica nas nossas próprias rotas.

## Opções consideradas

1. **Usar as rotas do Better Auth como vêm:** menos código, mas algumas devolvem mais do que a tela precisa (a lista de sessões traz o token de cada uma) e aceitam opções que deixariam a segurança a cargo do navegador (encerrar ou não os outros aparelhos ao trocar a senha).
2. **Rotas do Better Auth com as regras impostas no servidor, e uma rota nossa onde a do Better Auth expõe demais:** as operações sensíveis continuam na biblioteca, que já cuida de senha e de sessão, e o que a tela recebe é só o necessário.

## Decisão

**Opção 2.**

- **Nome:** `POST /api/auth/update-user`, validado com a mesma regra do cadastro. Só o nome passa: o resto do corpo é descartado no gancho `before`.
- **Senha:** `POST /api/auth/change-password`, com a senha atual e a nova (a mesma regra do cadastro). **Trocar a senha sempre encerra as sessões nos outros aparelhos**: o servidor força `revokeOtherSessions`, seja o que for que o navegador mande. A sessão atual continua. Limite de tentativas próprio, como o login ([ADR 0023](0023-rate-limit-autenticacao.md)).
- **Criar uma senha** (conta criada pelo Google, sem senha): o mesmo link de "Esqueci minha senha". A redefinição do Better Auth cria a senha quando a conta não tem uma, e o link prova que a pessoa é dona do e-mail. Como em toda redefinição, as sessões abertas são encerradas e a pessoa entra de novo, agora também com a senha.
- **Aparelhos conectados:** `GET /api/me/sessions`, uma rota nossa, devolve só o que a tela mostra: navegador e sistema (lidos do user-agent), início e último acesso, e qual é a sessão atual. **Sem token e sem IP, e sem cidade**, que exigiria um serviço de localização por IP ([ADR 0012](0012-privacidade-lgpd.md)). "Sair dos outros aparelhos" usa `POST /api/auth/revoke-other-sessions`.
- **E-mail** (num segundo momento, por ser o mais delicado): o novo endereço só passa a valer depois de confirmado por um link enviado **a ele**, e o endereço antigo recebe um aviso da troca.

## Consequências

- **A pessoa resolve sozinha** o que antes exigiria suporte: senha comprometida, nome errado, conta aberta num computador emprestado.
- **As regras de segurança ficam no servidor:** encerrar os outros aparelhos ao trocar a senha não depende da tela.
- **Uma rota a mais na API** (`/me/sessions`), coberta por testes, com o cuidado de nunca devolver o token de sessão.
- **Atualizações do Better Auth** precisam conferir que a redefinição continua criando a senha de quem não tem uma; um teste cobre isso.

## Nota (a página em cartões e a aparência, 2026-10-21)

Minha conta tinha quatro blocos, cada um de um jeito: uma caixa com borda, uma lista com divisórias e dois blocos de texto solto. Agora são cinco cartões (`SectionCard`, os mesmos do Painel, da Análise e da importação), numa coluna em todas as larguras, porque é uma página de configurações, para ler de cima para baixo:

- **Conta:** nome, e-mail, senha e termos, como antes.
- **Aparência** (novo): "Sistema | Claro | Escuro" (`SegmentedControl`, com as opções de `themeOptions` em `lib/theme.ts`, as mesmas do menu da conta). Quem procura configurações procura nesta página, e o menu continua com o atalho. A linha abaixo diz o que a escolha faz: "Segue o tema claro ou escuro do aparelho" ou "Vale só neste aparelho", porque o tema fica no navegador e nunca vai para a API (ADR 0036).
- **Aparelhos conectados:** como antes.
- **Seus dados:** uma linha ("Baixe uma cópia de tudo o que o Finanças guarda sobre você") e o botão. O que vem no arquivo, o formato JSON e os valores em centavos vão para o ⓘ do título.
- **Excluir conta:** o aviso continua à vista, mais curto, porque é uma consequência que se lê antes de agir, e não uma definição.

Os diálogos (alterar nome, trocar e-mail, trocar senha, sair dos outros aparelhos e excluir a conta) não mudam.
