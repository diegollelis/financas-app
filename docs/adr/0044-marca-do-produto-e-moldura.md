# 0044 — Marca do produto no app, barra lateral inteira e rodapé

- **Status:** Aceita
- **Data:** 2026-10-08

## Contexto

O PR da moldura ([ADR 0043](0043-identidade-visual-codelelis.md)) colocou a logo horizontal `<CodeLélis/> FINANÇAS` no topo da barra lateral e o símbolo CL no cabeçalho do celular. Em uso, apareceram três problemas:

- **A hierarquia da arte é o contrário do objetivo.** Na logo, "CodeLélis" é grande e "FINANÇAS" ocupa um oitavo da altura. O CodeLélis vai reunir vários apps, e cada app precisa se destacar. Nenhum tamanho de barra resolve isso, e no celular só cabia o CL.
- **No desktop, marca e contexto dividiam a linha:** a logo e, ao lado, o seletor de espaço ("Pessoal ▾"). A leitura ficava estranha.
- **Faltava um rodapé com a assinatura da marca.** Ele precisa respeitar as duas licenças: o código é MIT e a marca tem os direitos reservados ([LICENSE](../../LICENSE)).

## Opções consideradas

**Marca dentro do app**

1. **A arte completa em todo lugar:** fiel à arte, mas o produto continua pequeno.
2. **O símbolo oficial mais o nome do produto em texto** (`[CL] Finanças`): é a arquitetura "endossada", a do Google Drive e do Microsoft Teams.
3. **Encomendar uma arte com o produto em destaque:** a mais fiel, mas fica parada até a arte chegar.

**Moldura no desktop**

1. **Manter o cabeçalho** e afastar o seletor de espaço da marca.
2. **Uma barra lateral de altura inteira, sem cabeçalho,** como no Linear, no Notion e no Slack.

**Rodapé**

1. **"Todos os direitos reservados":** contradiz a licença MIT do código público.
2. **Só a assinatura:** "© CodeLélis".
3. **Marca e código separados.**

## Decisão

**Marca:** a opção 2.

- **Dentro do app:** `AppBrand`, o símbolo CL oficial (`BrandLogo variant="symbol"`) mais "Finanças" em texto, na fonte do app. É um link para "/".
- **Na porta de entrada** (login, cadastro, senha e convite): a arte completa continua.
- **Para os próximos apps:** a mesma assinatura (`[CL] Agenda`, `[CL] Estudos`). Nada da arte é redesenhado: o símbolo é o arquivo oficial, e o nome é texto.

**Moldura:**

- **Celular:**
  - o cabeçalho tem a marca, um divisor, o seletor de espaço e o menu da conta;
  - o espaço fica no cabeçalho, que é fixo, para estar sempre à vista: ao rolar até os lançamentos, ainda se vê onde se está, e lançar no espaço errado é o erro que mais custa;
  - as seções ficam na barra inferior com "Mais".
- **Desktop (do md em diante):**
  - não há cabeçalho sobre o conteúdo;
  - a barra lateral, de 240 px e da altura da tela, tem a marca, o seletor de espaço (uma caixa da largura da barra), as seções e, embaixo, a conta, com nome e e-mail;
  - o menu da conta abre para cima.
- **Páginas fora de um espaço** (Minha conta): o cabeçalho com a marca e a conta, em qualquer largura.
- **Uma peça, um lugar:** cada peça é renderizada uma vez, no lugar que a tela pede (`useMediaQuery`), não duas vezes com uma escondida por CSS. Assim leitores de tela e testes encontram um só seletor de espaço e um só menu da conta.

**Saber em que espaço se está:**

- **Rótulo:** o seletor mostra "Espaço" acima do nome, no celular e no desktop. Um nome sozinho ("Pessoal", "Casa") poderia ser lido como um filtro ou uma conta.
- **No formulário de lançamento,** a descrição diz o espaço: "Competência de outubro de 2026 em Casa."

**Rodapé:** `AppFooter` no fim de toda página: nas páginas de um espaço, em Minha conta, nas telas de entrada e nas páginas legais. O texto:

- "© ano CodeLélis. A marca é de uso reservado; o código é aberto (licença MIT).";
- os links Termos de uso, Política de privacidade e Código-fonte.

O ano vem de `currentPeriod()`.

**O que sai do ADR 0043:** a barra de 288 px e o cabeçalho de 72 px do lg em diante. Eles existiam só para a logo horizontal caber na barra.

## Consequências

- **O produto aparece grande em qualquer tela,** e a marca-mãe fica na entrada e no rodapé.
- **O conteúdo do desktop ganha a altura do antigo cabeçalho.**
- **Um app CodeLélis novo copia `AppBrand` e `AppFooter`,** trocando o nome do produto e o link do código.
- **Se vier uma arte com o produto em destaque,** ela pode substituir o texto em `AppBrand` sem mexer na moldura.
- **Testes:**
  - o celular é o padrão;
  - um teste de desktop (`stubPrefersDark(false, { desktop: true })`) confere que não há cabeçalho e que a conta está na barra lateral.
