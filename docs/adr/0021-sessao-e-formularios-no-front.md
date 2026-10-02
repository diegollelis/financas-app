# 0021 — Sessão, rotas protegidas e formulários no front

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

A API já tem cadastro, login e logout ([ADR 0020](0020-integracao-better-auth-nestjs.md)). O front precisa das telas, saber se há alguém logado, proteger as páginas e validar formulários. Essas escolhas vão se repetir em todas as telas das próximas fases.

## Opções consideradas

**Como falar com as rotas de autenticação**

1. **Cliente do Better Auth** (`createAuthClient`, `useSession`): menos código e o login com Google fica mais simples. Em troca, o front fica acoplado à biblioteca e passa a ter um segundo caminho de chamadas à API, fora do cliente validado do [ADR 0016](0016-estrutura-do-front.md).
2. **Nosso cliente de API** (`apiPost` + TanStack Query): o mesmo caminho das outras chamadas, sem dependência nova.

**Formulários**

1. Estado controlado à mão com `useState`: sem dependência, mas repetitivo a cada campo.
2. **React Hook Form + `zodResolver`**: valida com o **mesmo schema Zod do shared** e é o padrão do shadcn/ui.

**Endereços das páginas**

1. Em inglês (`/sign-in`), como as rotas da API.
2. **Em português** (`/entrar`, `/cadastro`): a URL aparece para o usuário, então faz parte da interface.

## Decisão

- **Nosso cliente de API.** `src/lib/api.ts` ganhou o `apiPost`, e o `ApiError` agora carrega o `code` e a mensagem que a API devolve. Os textos mostrados ao usuário saem de `authErrorMessage`, que traduz os códigos do Better Auth para pt-BR.
- **A sessão é a query `['me']`** (`useMe`, que chama `GET /me`). Um 401 vira `null` (não há sessão) e não é tratado como erro. Cadastro e login gravam o usuário devolvido direto nessa query, sem chamar a API de novo. O logout grava `null` e **apaga o restante do cache**, para que a próxima pessoa no mesmo navegador não veja dados da anterior.
- **Rotas de layout como proteção** (`src/features/auth/route-guards.tsx`):
  - `RequireAuth` manda quem não tem sessão para `/entrar` e entrega o usuário às páginas pelo `Outlet context` (`useCurrentUser()`), que nunca vem nulo.
  - `GuestOnly` manda para `/` quem já está logado. Por isso o login não precisa navegar: ao gravar o usuário na query, a proteção redireciona sozinha.
- **Formulários com React Hook Form + `zodResolver`**, usando os schemas do shared (`signUpInputSchema`, `signInInputSchema`). As mensagens de validação ficam no próprio schema, em pt-BR. O componente `FormField` liga o rótulo, o campo e a mensagem de erro para leitores de tela (`aria-invalid`, `aria-describedby`).
- **A API valida o cadastro com o mesmo schema** (hook `before` do Better Auth) e segue com o corpo já validado. Com isso, o nome chega sem espaços nas pontas e um nome com mais de 100 caracteres vira 400, em vez de erro de banco.
- **URLs das páginas em português.** Nomes de arquivos, componentes e rotas da API continuam em inglês ([ADR 0011](0011-idioma-do-codigo.md)).
- **Testes** renderizam o app inteiro com as rotas reais (`renderApp(path)`), e uma API falsa responde por método e caminho (`mockApi`). Uma chamada não prevista faz o teste falhar.

## Consequências

- O login com Google vai precisar de um pequeno passo extra no front: pedir a URL de autorização ao Better Auth e redirecionar o navegador para ela.
- A mensagem "Já existe uma conta com este e-mail" revela que o e-mail está cadastrado (enumeração de contas). O próprio Better Auth já devolve esse código. Revisar quando a verificação de e-mail entrar, porque ela permite responder do mesmo jeito nos dois casos.
- Novas telas seguem o mesmo padrão: um hook por chamada em `src/features/<assunto>/`, um formulário com o schema do shared e uma página em `src/routes/` sob `RequireAuth`.
