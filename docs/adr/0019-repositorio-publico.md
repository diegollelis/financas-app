# 0019 — Repositório público: proteção contra vazamento de segredos e dados pessoais

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

O repositório foi criado no GitHub como **público**: os _rulesets_ de proteção de branch exigem plano pago em repositórios privados de contas pessoais. Num repositório público, **todo o histórico** fica visível, não só a versão atual dos arquivos. Um segredo removido num commit posterior continua acessível no commit em que entrou, e robôs varrem o GitHub em busca de credenciais minutos depois de um push. A aplicação lida com dados financeiros pessoais ([0012](0012-privacidade-lgpd.md)), e a planilha de origem contém dados bancários.

Antes da publicação, auditamos o histórico: nenhuma credencial (gitleaks), nenhum `.env`, planilha ou dump. O único dado pessoal exposto era o e-mail do autor nos commits.

## Opções consideradas

1. **Só o `.gitignore`**: evita os casos previstos, mas não pega um segredo colado dentro de um arquivo de código.
2. **Varredura só no CI**: pega o segredo, mas **depois** do push, quando ele já é público.
3. **Defesa em camadas**: bloqueio local antes do commit, bloqueio no push pelo GitHub e varredura no CI.

## Decisão

Defesa em camadas:

| Camada              | Onde           | O que faz                                                                                                    |
| ------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| `.gitignore`        | local          | ignora `.env*`, planilhas, extratos (`*.csv`, `*.ofx`, `*.qif`), dumps, bancos locais, chaves e certificados |
| Hook de pre-commit  | local          | **lefthook** roda o **gitleaks** no que está sendo commitado e bloqueia o commit se achar credencial         |
| _Push protection_   | GitHub         | o _secret scanning_ do GitHub recusa pushes com tokens de provedores conhecidos                              |
| Job `secrets` no CI | GitHub Actions | gitleaks no **histórico completo** a cada push e PR                                                          |
| E-mail noreply      | git            | commits assinados com `<id>+<usuário>@users.noreply.github.com`, não com o e-mail pessoal                    |

E também:

- Serviços locais (Postgres do Docker) escutam só em `127.0.0.1`: as senhas de desenvolvimento são públicas no repositório.
- Dados de exemplo em testes e docs são sempre **fictícios**. Nunca copiar linhas da planilha real.
- O histórico publicado foi reescrito uma vez (2026-10-02) para trocar o e-mail do autor, antes de existirem forks.

## Consequências

- Todo desenvolvedor precisa do gitleaks instalado (`winget install Gitleaks.Gitleaks`); sem ele, o hook falha e o commit é bloqueado. Em emergência, `LEFTHOOK=0 git commit ...` pula o hook. O CI continua verificando.
- **Se um segredo vazar mesmo assim**: considerar o segredo comprometido e **revogá-lo/rotacioná-lo imediatamente** no provedor. Reescrever o histórico não basta: o GitHub mantém commits acessíveis por SHA, e o segredo pode já ter sido coletado.
- Falsos positivos do gitleaks são liberados com `.gitleaksignore` (fingerprint do achado), com justificativa no commit.
- A imagem do gitleaks no CI é fixada por digest; o Dependabot não a atualiza. Atualizar manualmente junto com a versão local.
- Uma fixture de teste em `.csv` precisa de exceção explícita no `.gitignore` (`!caminho`).
