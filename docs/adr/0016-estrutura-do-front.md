# 0016 — Estrutura do front: shadcn/ui com Radix, React Router 8 e cliente de API validado

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

O [ADR 0003](0003-frontend-react-vite-typescript.md) definiu as bibliotecas do front. Na fase 1, faltavam três decisões de uso: qual base de componentes o shadcn/ui deve usar, como o React Router é configurado e como o front chama a API garantindo o contrato do [ADR 0006](0006-validacao-zod-compartilhada.md).

## Opções consideradas

1. **shadcn/ui sobre Base UI**: o preset padrão atual do CLI, mas com menos material e exemplos.
2. **shadcn/ui sobre Radix**: a base clássica, com a maior parte da documentação e dos exemplos da comunidade.
3. **React Router no modo declarativo** (`<BrowserRouter>`/`<Routes>`) **ou no modo data** (`createBrowserRouter`): o modo data dá acesso a loaders, actions e tratamento de erro por rota.
4. **Chamar a API com `fetch` direto nos componentes** ou por um **cliente único** que valida as respostas.

## Decisão

- **shadcn/ui com base Radix** e preset **Nova** (fonte Geist, ícones Lucide). Os componentes são copiados para `src/components/ui/` e passam a ser código nosso.
- **React Router 8 no modo data** (`createBrowserRouter` em `src/router.tsx`). Os dados continuam no **TanStack Query**; loaders do Router só se surgir uma necessidade clara.
- **Cliente de API único** (`src/lib/api.ts`): toda resposta é validada com o schema Zod de `@financas/shared`, e as requisições enviam cookies (`credentials: 'include'`) para a sessão do [ADR 0007](0007-autenticacao-better-auth.md).
- **Organização por funcionalidade**: `src/features/<assunto>/` reúne hooks e componentes de um assunto; `src/routes/` guarda as páginas.
- **Variáveis de ambiente do front** também validadas com Zod (`src/lib/env.ts`). Só variáveis `VITE_*` chegam ao navegador e **nunca** podem conter segredos.

## Consequências

- Se a API quebrar o contrato, o erro aparece no cliente de API, não no meio de um componente.
- Atualizar um componente do shadcn é manual (`shadcn add <nome> --overwrite`), pois o código é nosso.
- O `cn()` vem do pacote `cn` (do próprio shadcn), que substitui `clsx` + `tailwind-merge`.
- As regras `react-hooks` e `react-refresh` do ESLint valem só para `apps/web/src`.
