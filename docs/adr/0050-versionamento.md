# 0050 — Versões do app: tags com versionamento semântico e releases no GitHub

- **Status:** Aceita
- **Data:** 2026-10-10

## Contexto

O app vai para o ar a cada merge no `main`: a Cloudflare Pages publica o site e o Render, a API. Isso continua assim. Até agora, porém, nada dizia "esta é a versão X", e o app passa a ter uso real, com as fases 1 a 4 prontas e a revisão das telas e dos textos legais terminada.

Sem um nome de versão, fica difícil:

- **dizer em que versão um problema apareceu**, na hora de anotá-lo durante o uso;
- **comparar o que mudou** entre dois momentos, ou voltar ao código de uma época;
- **contar o que cada conjunto de mudanças trouxe.** Os PRs registram tudo, mas um a um.

## Opções consideradas

1. **Não versionar:** o histórico do `main` é a única referência. Não custa nada, mas não resolve nenhum dos problemas acima.
2. **Versão no `package.json` a cada PR,** como fazem as bibliotecas publicadas no npm. O app não é publicado como pacote, e subir o número em todo PR gera conflitos entre branches e um número sem significado.
3. **Tags com versionamento semântico e uma release no GitHub por lote relevante de PRs.** A tag é um nome fixo para um commit do `main`, e a release é a página que conta o que ele trouxe. Não muda o deploy nem pede ferramenta nova.

## Decisão

Opção 3.

- **A tag é a fonte da versão:** `vMAIOR.MENOR.CORREÇÃO`, anotada (`git tag -a`), sempre num commit do `main` que já está no ar e foi conferido em produção. Os `package.json` continuam sem o campo `version`: não há pacote publicado, e o número num só lugar não diverge.
- **Versionamento semântico** ([semver.org](https://semver.org/lang/pt-BR/)), lido do ponto de vista de quem usa o app:
  - **CORREÇÃO** (1.0.1): corrige defeitos sem mudar o uso;
  - **MENOR** (1.1.0): traz funções novas e mantém tudo o que existia;
  - **MAIOR** (2.0.0): muda algo de um jeito que exige reaprender ou refazer, por exemplo uma mudança de regra do orçamento que altera números já lançados.
- **Quando marcar:** quando um conjunto de PRs fecha uma entrega, não a cada PR. Uma correção urgente pode ganhar a sua própria versão de correção.
- **Release no GitHub para cada tag,** escrita em pt-BR ([ADR 0011](0011-idioma-do-codigo.md)) e organizada por tema, com o que muda para quem usa e, separado, o que muda por dentro. Os PRs que entraram ficam listados pelo próprio GitHub ("Generate release notes"), abaixo do resumo.
- **O roadmap** (`docs/roadmap.md`) registra a versão em que cada fase ou lote foi entregue, a partir da 1.0.0.

**A 1.0.0** marca o `main` com este ADR, que só acrescenta documentação ao que está no ar desde o PR #108: as fases 1 a 4 prontas, o front-end mobile-first, a revisão das telas e a revisão dos textos legais e da segurança ([ADR 0041](0041-termos-exportacao-e-exclusao-de-conta.md), nota de 2026-10-10).

**Como marcar uma versão:**

1. Conferir o `main` em produção.
2. `git switch main`, `git pull`, `git tag -a v1.0.0 -m "1.0.0"` e `git push origin v1.0.0`. A proteção do `main` vale para os branches, não para as tags.
3. No GitHub: Releases → Draft a new release, escolher a tag, colar o resumo e usar "Generate release notes".

## Consequências

- **Um problema anotado diz a versão:** "apareceu na 1.0.0". Por enquanto, a versão no ar é a última tag. Mostrar o número no próprio app, no rodapé, fica como melhoria futura, se fizer falta.
- **Comparar e voltar ficam fáceis:** `git diff v1.0.0 v1.1.0` mostra o que mudou entre duas versões, e o GitHub tem a mesma comparação na página da release.
- **O deploy não muda:** cada merge continua indo para o ar. A versão é um nome dado depois, não uma etapa de publicação. Por isso, entre duas tags o app no ar pode ter mudanças ainda sem versão.
- **Um passo manual a mais por versão:** a tag e a release. Se ficar repetitivo, um workflow pode criar a release a partir da tag. Rever a decisão se o app passar a ter um app instalado nas lojas, que exige número de versão em cada envio.
