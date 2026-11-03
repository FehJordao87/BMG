---
mode: agent
description: Gera os cenários BDD (CT-nn) de uma história a partir de 00-historia.md e do contrato das APIs
---

Gere os cenários de teste da história **${input:key:Chave da história (ex. CONSIG-123)}**.

## Entradas obrigatórias
- `qa/target/${input:key}/00-historia.md` — se não existir, pare e peça para rodar `/qa-01-analisar-historia` primeiro.
- `qa/target/${input:key}/01-contrato.md` — se não existir, avise e siga só com a história; todo cenário de API fica marcado `**Contrato:** não verificado`.
- `.github/copilot-instructions.md` — formato e regras.

## Como pensar a cobertura

Para cada critério de aceite da história, em ordem:

| Tipo | Quando gerar | Camada |
|---|---|---|
| positivo | sempre — um por critério | front se o critério fala de tela; api se fala de serviço/retorno; os dois se fala de ambos |
| negativo | quando há validação, obrigatoriedade, permissão ou limite | mesma do positivo |
| borda | valores limite, vazio, máximo, duplicidade, concorrência — só se o critério ou regra citar | mesma |
| contrato | para cada rota citada no `01-contrato.md` que a história usa: status code e campos obrigatórios da resposta | api |

Regras:
- Um critério sem resultado esperado claro **não gera cenário** — vai para "Pendências" com a pergunta ao PO.
- Nome de campo de API só se estiver no `01-contrato.md`; senão escreva `<campo>` e marque `(sondar)`.
- Não gere cenário de comportamento que a história não descreve (ex.: "sistema deve logar", "deve ter timeout") — isso é sugestão, vai em "Melhorias sugeridas".
- Massa: diga **o que** precisa existir (ex.: "cliente com proposta ativa"), não como criar.

## Saída

Grave `qa/target/${input:key}/01-cenarios.md`:

```markdown
# Cenários — ${input:key}
**Gerado em:** <data/hora> · **Base:** 00-historia.md (<n> critérios) · **Contrato:** 01-contrato.md | não verificado

## Matriz de cobertura
| Critério | CTs | Camadas |
|---|---|---|
| 1 | CT-01, CT-02 | front |
| … | … | … |

## Cenários
### CT-01 — …
(formato exato do copilot-instructions.md)

## Pendências (perguntas ao PO)
- P-01: <pergunta> — bloqueia: <critério n>

## Melhorias sugeridas (fora do requisito — não testar sem aprovação)
- …
```

Depois de gravar, mostre na conversa **só a matriz de cobertura e as pendências**, e pergunte: "Algum CT para remover, juntar ou dividir antes de criar no Xray?"
