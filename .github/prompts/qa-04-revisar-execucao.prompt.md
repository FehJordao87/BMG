---
mode: agent
description: Lê o resultado da execução, classifica cada vermelho (bug, massa, spec errado) e prepara o texto do bug
---

Revise a execução da história **${input:key:Chave da história}**.

## Entradas
- `reports/results.json` e `reports/junit-results.xml` da rodada que acabou de rodar. Se a data de modificação for anterior ao último spec gerado, pare e avise: "resultado mais antigo que o spec".
- `qa/target/${input:key}/01-cenarios.md` para saber o que cada CT deveria validar.
- `qa/target/${input:key}/evidencias/index.html` (rode `node qa/evidencias-gerar.mjs ${input:key}` antes se não existir).

## Para cada CT

Monte a tabela:

| CT | Resultado | Classificação | Próximo passo |
|---|---|---|---|
| CT-01 | passou | — | publicar |
| CT-02 | falhou | **bug** / **massa** / **spec** / **ambiente** | … |

Critério de classificação (nessa ordem, pare na primeira que bater):
1. **ambiente** — timeout de rede, 5xx, URL não configurada → não é bug da história.
2. **massa** — erro diz que registro não existe, usuário sem permissão, dado pré-condicional ausente.
3. **spec** — seletor não encontrado, campo `(sondar)` errado, asserção sobre coisa que o CT não afirma.
4. **bug** — o sistema respondeu, a massa existia, o spec está certo e o resultado contraria o critério de aceite. Só aqui.

## Para cada **bug**

Grave `qa/target/${input:key}/bugs/BUG-CT-<nn>.md`:

```markdown
# [${input:key}] <título curto do defeito>
**CT:** CT-nn · **Critério:** <n> · **Ambiente:** <TEST_ENV> · **Execução:** <data/hora>
**Severidade sugerida:** bloqueante | alta | média | baixa — <motivo em uma frase>

## Passos para reproduzir
1. … (copiados do Gherkin, com dados reais usados)

## Resultado esperado
<do critério de aceite, citado>

## Resultado obtido
<do erro/screenshot, sem interpretar>

## Evidência
qa/target/${input:key}/evidencias/CT-nn.pdf
```

**Não crie a issue no Jira.** Mostre o arquivo e pergunte: "Crio este bug no Jira vinculado a ${input:key}?" — um por vez. Só crie (via MCP Atlassian) depois de um "sim" explícito para aquele bug.

## Para **spec** e **massa**
Proponha a correção (diff do spec, ou lista da massa que falta) e pergunte se aplico. Não rode de novo sem eu pedir.

## Fechamento
Resuma em 3 linhas: quantos passaram, quantos bugs, quantos aguardam massa/spec. Se **todos** passaram, diga que está pronto para `node qa/xray-publicar.mjs ${input:key}`.
