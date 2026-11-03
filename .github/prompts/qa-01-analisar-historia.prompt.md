---
mode: agent
description: Lê uma história do Jira (via MCP Atlassian) e grava a versão normalizada em qa/target/<KEY>/00-historia.md
---

Você vai analisar a história **${input:key:Chave da história no Jira (ex. CONSIG-123)}**.

## Passos

1. Com o MCP da Atlassian, busque a issue `${input:key}` com todos os campos: resumo, descrição, critérios de aceite (campo próprio ou dentro da descrição), issues linkadas, subtarefas, anexos, épico/pai, labels, componentes, status.
2. Se a issue tiver issues linkadas do tipo "relates to", "is blocked by" ou "depends on", busque o resumo delas também (só resumo e status — não aprofunde).
3. Crie a pasta `qa/target/${input:key}/` se não existir.
4. Grave `qa/target/${input:key}/00-historia.md` com esta estrutura, **sem interpretar nem completar** o que a história não diz:

```markdown
# ${input:key} — <resumo>
**Status:** … · **Tipo:** … · **Épico/Pai:** … · **Componentes:** … · **Lida em:** <data/hora>

## Descrição
<texto da descrição, convertido para markdown, sem cortes>

## Critérios de aceite
1. <critério, um por linha numerada — se vierem em Gherkin, mantenha o Gherkin>
2. …

## Regras de negócio
- RN-1: <regra explícita no texto; se não houver, escreva "Nenhuma regra explícita além dos critérios">

## Telas / APIs citadas
- <nomes de tela, rotas, sistemas mencionados — só o que está escrito>

## Issues relacionadas
- <KEY> — <resumo> — <status>

## Anexos
- <nome do anexo> (<tipo>) — não lido

## Lacunas e ambiguidades
- <tudo que um QA precisaria perguntar ao PO antes de testar: termos vagos, critério sem resultado esperado, campo sem regra de validação>
```

5. Grave também `qa/target/${input:key}/00-historia.json` com os campos brutos retornados pelo MCP (para auditoria).
6. Mostre na conversa **apenas** a seção "Lacunas e ambiguidades" e pergunte: "Quer que eu siga para os cenários com essas lacunas como pendências, ou prefere resolver alguma antes?"

## Proibido
- Inventar critério que não está na issue.
- Resumir a descrição — ela vai inteira.
- Marcar lacuna como resolvida por suposição.
