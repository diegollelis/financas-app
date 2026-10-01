# 0001 — Registrar decisões de arquitetura com ADRs

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

O projeto é um laboratório de estudo: o objetivo é aprender a **tomar e justificar** decisões full stack, não só escrever código. Decisões sem registro se perdem e não mostram o raciocínio para quem avaliar o portfólio.

## Opções consideradas

1. **Sem registro formal** — rápido, mas o "porquê" se perde.
2. **Wiki/Notion externo** — separado do código, desatualiza com facilidade.
3. **ADRs em Markdown no repositório** — versionados junto com o código, revisáveis em PR.

## Decisão

Usar ADRs (formato MADR enxuto) em `docs/adr/`, numerados sequencialmente, a partir do [template](0000-template.md).

## Consequências

- Toda decisão relevante (biblioteca, padrão, infraestrutura, regra transversal) ganha um ADR **antes** ou **junto** da implementação.
- ADRs não são apagados: uma decisão revista gera um novo ADR e o antigo passa a "Substituída por".
- O índice em [README.md](README.md) é atualizado a cada novo ADR.
