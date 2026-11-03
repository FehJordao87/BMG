# qa/ — fluxo de QA assistido por Copilot no novoconsig-e2e

Cada história passa por 6 passos. O Copilot (modo agente) faz a parte semântica; os scripts fazem a parte que não pode errar. **Nada sobe para o Jira/Xray sem você ver o arquivo antes.**

| # | Comando | Quem | Entrada → Saída |
|---|---|---|---|
| 1 | `/qa-01-analisar-historia` `CONSIG-123` | Copilot + MCP Atlassian | Jira → `qa/target/CONSIG-123/00-historia.md` + lacunas |
| 2 | `/qa-02-gerar-cenarios` `CONSIG-123` | Copilot | 00-historia + 01-contrato → `01-cenarios.md` (CT-nn, matriz, pendências) |
| 3 | `node qa/xray-criar-testes.mjs CONSIG-123 --pasta "/Pasta/No/Test Repository" --plan CONSIG-900` | script | 01-cenarios → issues Test no Xray, na pasta/Test Plan escolhido → `02-xray-ids.json` |
| 4 | `/qa-03-gerar-spec` `CT-01` `CONSIG-123` | Copilot | 01-cenarios + 02-xray-ids → `tests/<camada>/<projeto>/CONSIG-123-CT-01-*.spec.ts` |
| 5 | `TEST_ENV=hml npx playwright test -g CONSIG-123` → `node qa/evidencias-gerar.mjs CONSIG-123` → `/qa-04-revisar-execucao` | você + script + Copilot | results.json → `evidencias/CT-nn.{html,pdf}` + `index.html` + classificação dos vermelhos |
| 6 | `node qa/xray-publicar.mjs CONSIG-123` | script | JUnit + evidências → Test Execution no Xray com PDF anexado por teste + comentário na história |

## O que está no pacote

- `.github/copilot-instructions.md` — regras e convenções que o Copilot lê em toda conversa.
- `.github/prompts/qa-01…qa-04.prompt.md` — os quatro prompts (aparecem como `/qa-01-…` no chat do Copilot).
- `qa/evidencias-gerar.mjs` — HTML + PDF por CT. Testado. Zero rede.
- `qa/_xray.mjs` — cliente do **Xray Cloud** (autenticação, GraphQL, import JUnit) e leitor de `config/<env>-secrets.json`.
- `qa/xray-criar-testes.mjs` — cria os CTs como issues **Test (Cucumber)** na pasta do Test Repository e no Test Plan. Idempotente (`02-xray-ids.json`). `--dry-run` mostra tudo sem criar; sem ele, pede `s` no terminal.
- `qa/xray-publicar.mjs` — filtra o JUnit só para a história, cria/atualiza a Test Execution, anexa o PDF a cada test run, imprime o comentário para a história. `--dry-run` disponível.

Os três scripts do Xray **não foram executados contra um Xray real** — só o parser, o filtro de JUnit, a leitura de segredos e os `--dry-run`. Primeira rodada real: use `--dry-run`, depois `--so CT-01` para criar um só e conferir no Jira.

## Segredos

`config/hml-secrets.json` (ou `config/<TEST_ENV>-secrets.json`). O leitor aceita qualquer destes formatos:

```json
{ "XRAY_CLIENT_ID": "…", "XRAY_CLIENT_SECRET": "…", "JIRA_PROJECT_KEY": "CONSIG", "JIRA_BASE_URL": "https://bmg.atlassian.net" }
{ "xray": { "clientId": "…", "clientSecret": "…" }, "jira": { "baseUrl": "https://bmg.atlassian.net" } }
```

Variáveis de ambiente com os mesmos nomes têm prioridade. Sem `JIRA_PROJECT_KEY`, o projeto é o prefixo da chave (`CONSIG-123` → `CONSIG`). O valor do segredo nunca é impresso.

## Vínculo Test → história

O `createTest` do Xray não cria o link com a história. O link nasce de duas formas, e as duas já estão cobertas:
1. No import do JUnit, pela property `requirement` que o `linkToXray` do repo já exporta (o `/qa-03` sempre a preenche).
2. Se quiser antes de executar: peça ao Copilot "linke os Tests de `qa/target/<KEY>/02-xray-ids.json` à história <KEY>" — ele usa o MCP Atlassian com o seu login.

## Pendência que só você resolve

- **Swagger das BFFs** (`fontes-coletar.mjs`): com VPN, tente `https://<host-bff-hml>/swagger`, `/swagger/index.html`, `/swagger/v1/swagger.json`, `/api-docs`, `/openapi.json`. Enquanto não houver, o `/qa-02` marca cenários de API como `Contrato: não verificado` e o `/qa-03` usa `// SONDAR:`.

## Instalação no repositório

```bash
# na raiz do novoconsig-e2e
cp -r <este-pacote>/.github/prompts .github/
cp <este-pacote>/.github/copilot-instructions.md .github/
cp -r <este-pacote>/qa .
echo "qa/target/" >> .gitignore
```

No VS Code: Settings → `chat.promptFiles: true` (se ainda não estiver). Os prompts aparecem digitando `/qa-` no chat do Copilot.

MCP da Atlassian (só Cloud): em `.vscode/mcp.json`:

```json
{ "servers": { "atlassian": { "type": "http", "url": "https://mcp.atlassian.com/v1/mcp" } } }
```

Na primeira chamada o VS Code abre o navegador para você logar com sua conta normal.

## Ajustes no `playwright.config.ts`

Confirme que existem (o README do repo indica que sim):

```ts
reporter: [
  ['html', { outputFolder: 'reports/html', open: 'never' }],
  ['json', { outputFile: 'reports/results.json' }],
  ['junit', { outputFile: 'reports/junit-results.xml' }],
],
```

Para evidência de sucesso com print, os specs gerados pelo `/qa-03` anexam screenshot por passo via `testInfo.attach` — não depende de `screenshot: 'on'`. Mantenha `trace: 'retain-on-failure'`.

## Regras do `evidencias-gerar.mjs`

- Só lê `reports/results.json`. "Passou" = `status: passed`. CT sem resultado na rodada não aparece como passou.
- Mascara `baseURL` de todos os projects e qualquer `*_URL*` do ambiente → `{{base_url}}`; `Authorization`/`Bearer` → `{{token}}`; `password`/`secret`/`cookie` → `{{oculto}}`.
- Opções: `--results <caminho>`, `--saida <pasta>`, `--sem-pdf`.
- Avisa se o `results.json` tem mais de 60 min.
