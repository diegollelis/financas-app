# 0011 — Idioma do código, da interface e da documentação

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

Os usuários são brasileiros, mas o código é portfólio para o mercado, e bibliotecas, mensagens de erro e a maior parte do material de estudo estão em inglês. No Protheus é comum misturar português e inglês nos nomes.

## Opções consideradas

1. **Tudo em português** — natural para o domínio, mas destoa das bibliotecas e reduz o alcance do portfólio.
2. **Tudo em inglês** — consistente, mas a documentação de estudo fica menos acessível.
3. **Código em inglês, interface e documentação em português**.

## Decisão

- **Código** (identificadores, tabelas, colunas, rotas da API, mensagens de commit): **inglês**.
- **Interface** do usuário: **português (pt-BR)**, com textos centralizados para permitir i18n futura.
- **Documentação** (ADRs, domínio, roadmap, README): **português**.
- O [glossário](../dominio/glossario.md) mapeia os termos de negócio pt-BR ↔ en.

## Consequências

- Exemplos: Espaço → `Workspace`, Lançamento → `Transaction`, Competência → `period`.
- Mensagens de commit seguem Conventional Commits em inglês (`feat:`, `fix:`, `docs:`).
