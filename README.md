# qa-copilot — fluxo de QA assistido (Copilot + Playwright + Jira/Xray Cloud)

Pacote para colar na raiz de um repositório de automação Playwright. Leia `qa/README.md` para o fluxo dos 6 passos.

## Como usar com rede bloqueada (ciclo de ajuste)

1. Neste repositório (seu Git): `git pull`.
2. Na BMG, no repo de automação: copie `.github/` e `qa/` para a raiz (sem sobrescrever um `copilot-instructions.md` que já exista — mescle).
3. Rode **uma vez** `node qa/diagnostico.mjs > qa-diagnostico.txt` e cole o conteúdo na conversa. Ele não contém valores de segredo (só nomes de chaves; hosts mascarados).
4. Com o diagnóstico, as convenções de `.github/copilot-instructions.md` são preenchidas para o repo real.
5. Daí em diante: rode o passo, cole a saída (do terminal ou do arquivo em `qa/target/<KEY>/`), receba o ajuste.

Arquivos de `qa/target/` nunca são versionados.
