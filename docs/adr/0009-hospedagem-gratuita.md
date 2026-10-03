# 0009 — Hospedagem gratuita

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

Projeto de estudo, sem receita, que será aberto ao público. Custo zero é requisito; um domínio próprio deve ser adicionado no futuro. Os limites de planos gratuitos mudam com frequência — **conferir as páginas de preço antes do deploy (fase 4)**.

## Opções consideradas

- **Front:** Vercel (Hobby proíbe uso comercial) · **Cloudflare Pages** (sem essa restrição, CDN global) · Netlify.
- **API:** **Render** (Docker, hiberna quando ociosa) · Koyeb · Fly.io/Railway (sem plano gratuito real) · VM Oracle Cloud Always Free (gratuita, mas toda a operação por nossa conta).
- **Banco:** **Neon** (sem expiração, desliga quando ocioso, branches) · Supabase (pausa projetos inativos) · Postgres do Render (expira).

## Decisão

| Peça             | Serviço                                                                            |
| ---------------- | ---------------------------------------------------------------------------------- |
| Frontend         | **Cloudflare Pages**                                                               |
| API              | **Render** (imagem Docker)                                                         |
| Banco            | **Neon** (PostgreSQL)                                                              |
| E-mail           | **Resend**                                                                         |
| Erros            | **Sentry**                                                                         |
| Domínio (futuro) | `.com.br` no **Registro.br**, DNS na **Cloudflare** (`app.` → front, `api.` → API) |

## Consequências

- **Cold start**: após ~15 min ociosa, a API leva de 30 a 60 s para responder. O front deve mostrar um estado de carregamento amigável. Aceito para a fase de estudo.
- Como a API roda em Docker, migrar para uma VM (Oracle) ou plano pago não exige reescrita.
- O backup do plano gratuito do Neon é limitado: dumps periódicos via GitHub Actions ([0012](0012-privacidade-lgpd.md)).
- Ambientes: `local` (Docker) e `produção`; um ambiente de homologação pode usar um branch do Neon.
- Limites conferidos em 2026-10-03 e topologia de produção (front e API no mesmo site via proxy): [ADR 0033](0033-topologia-e-limites-do-deploy.md).
