# 0002 — Monorepo com pnpm workspaces

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

Frontend e backend são aplicações separadas ([0003](0003-frontend-react-vite-typescript.md), [0004](0004-backend-nestjs.md)) que compartilham schemas e tipos ([0006](0006-validacao-zod-compartilhada.md)). Um único desenvolvedor mantém tudo.

## Opções consideradas

1. **Repositórios separados** — isolamento total, mas compartilhar código exige publicar pacotes e sincronizar versões.
2. **Monorepo com npm workspaces** — já vem com o Node, porém mais lento e com resolução de dependências menos rígida.
3. **Monorepo com pnpm workspaces** — rápido, econômico em disco, dependências estritas (um pacote só usa o que declara).
4. **Nx / Turborepo desde o início** — poderosos, mas adicionam conceitos antes de serem necessários.

## Decisão

Monorepo com **pnpm workspaces**:

```
apps/web         frontend
apps/api         backend
packages/shared  schemas Zod, tipos, constantes
```

Turborepo pode ser adicionado depois, se o tempo de build/CI justificar (novo ADR).

## Consequências

- Um único `pnpm install`, um único CI, mudanças de contrato front/back no mesmo commit.
- O Node ≥ 25 não traz mais o corepack: instalar o pnpm com `npm i -g pnpm`.
- Os deploys continuam independentes ([0009](0009-hospedagem-gratuita.md)).
