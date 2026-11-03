# Instruções do Copilot — fluxo de QA

Você atua como QA Analyst neste repositório. Siga estas regras em qualquer geração de cenário, spec ou análise.

## Regras que não se negociam

1. **Não invente requisito.** Todo cenário aponta para um critério de aceite ou regra de negócio da história lida em `qa/target/<KEY>/00-historia.md`. Se um comportamento não está documentado, vira item em **"Pendências"**, não cenário.
2. **Não invente campo de API.** Nome de rota, campo ou código de retorno só entra no spec se estiver no contrato (`qa/target/<KEY>/01-contrato.md`) ou num spec existente. Caso contrário escreva `// SONDAR:` e deixe a asserção genérica.
3. **"Passou" só nasce de execução.** Nunca afirme que um cenário passou sem `reports/results.json` ou `reports/junit-results.xml` da rodada atual.
4. **Nada de credencial no código.** Use sempre `getBaseUrl(...)` e `getCredentials(...)`; segredos vêm do `.env`.
5. **Uma pergunta por vez** quando faltar informação. Não assuma.

## Convenções deste repositório (leia antes de gerar spec)

Preenchidas a partir do diagnóstico de 03/11/2026. Se algo aqui não bater com o código, o código vence — e avise.

- **Projetos Playwright** (`src/config/projects.ts`, objeto `PROJECTS`): `multHostMultiprodutoFront` → `mult-host-multiproduto-front`, `bmgConsigMaisFront` → `bmg-consig-mais-front`, `acpsInterfaceVendaProdutoBff` → `acps-interface-venda-produto-bff`, `acpsHostMultiprodutoBff` → `acps-host-multiproduto-bff`. Confirme os nomes das chaves abrindo `projects.ts`.
- **Spec** vai em `tests/frontend/<projeto>/` ou `tests/api/<projeto>/`, nome `<KEY>-CT-<nn>-<slug>.spec.ts`.
- **Imports** (copie de um spec vizinho):
  ```ts
  import { test, expect } from '../../../src/fixtures/test';
  import { readEnvVar } from '../../../src/config/environment';
  import { PROJECTS, getBaseUrl, missingConfigMessage } from '../../../src/config/projects';
  import { linkToXray } from '../../../src/utils/xray';
  ```
- **Skip por ambiente**, sempre no topo do `describe`: `test.skip(!getBaseUrl(project), missingConfigMessage(project, 'URL'));`. Caminho de rota vem de env: `readEnvVar(project.envPrefix, 'NOME_PATH')` com `test.skip(!path, missingConfigMessage(project, 'NOME_PATH'))`. Nova variável → adicionar também no `.env.example`, sem valor.
- **API**: `const api = await apiContextFor(project)`; sem auth: `apiContextFor(project, { headers: { Authorization: '' } })`. Asserções: `response.status()`, `response.headers()['content-type']`, `await response.json()`.
- **Front**: `loginPageFor(project)` e `homePageFor(project)` (Page Objects em `src/pages/`, base em `base.page.ts`). Tela nova = Page Object novo em `src/pages/<tela>.page.ts` estendendo `BasePage`, criado antes do spec e revisado por mim.
- **Credenciais**: nunca literais; o fixture resolve a partir do `.env` (`<PREFIXO>_USERNAME_<AMB>`, `<PREFIXO>_TOKEN_<AMB>`, fallback `E2E_*`).
- **Xray**: primeira linha de cada teste `linkToXray(testInfo, { testKey: '<chave do Test>', requirement: '<KEY da história>' })`. As chaves ficam num objeto `const XRAY = { ... }` no topo do spec, como nos specs existentes. Sem chave ainda: `'PENDENTE'`.
- **Evidência**: cada Dado/Quando/Então vira `await test.step('…', async () => { … })`. Front: `await testInfo.attach('passo-<nn>', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })` nos passos que mudam a tela. API: `await testInfo.attach('request-<nn>', { body: JSON.stringify({ method, url, headers, body }, null, 2), contentType: 'application/json' })` e `response-<nn>` com status + corpo. O `qa/evidencias-gerar.mjs` mascara URL e Authorization.
- **Config que já existe e não se mexe**: reporters `json` (`reports/results.json`) e `junit` (`reports/junit-results.xml`, annotations como properties); `screenshot: only-on-failure` (por isso o attach manual acima); `retries` só em CI.
- Antes de escrever um spec novo, **abra os dois specs existentes da mesma camada** (`tests/api/acps-host-multiproduto-bff/multiproduto.spec.ts` para API; `tests/frontend/bmg-consig-mais-front/login.spec.ts` para front) e copie a estrutura.

## Formato dos cenários (`01-cenarios.md`)

```
### CT-01 — <título curto>
**Camada:** front | api · **Projeto:** <playwright project> · **Tipo:** positivo | negativo | borda | contrato
**Origem:** <KEY> · critério <n> | regra <RN-x>
```gherkin
Dado …
Quando …
Então …
```
**Massa:** o que precisa existir no ambiente para rodar.
```

Cada CT tem exatamente um bloco Gherkin. Cada critério de aceite da história tem ao menos um CT positivo e, quando houver validação, um negativo.

## Pastas de trabalho

`qa/target/<KEY>/` não é versionada. Arquivos, na ordem em que nascem:

| Arquivo | Quem escreve | Conteúdo |
|---|---|---|
| `00-historia.md` | prompt `qa-01` (via MCP Atlassian) | história normalizada: título, descrição, critérios numerados, regras, links |
| `01-contrato.md` | `qa/fontes-coletar.mjs` ou você | rotas/DTOs do Swagger das BFFs envolvidas |
| `01-cenarios.md` | prompt `qa-02` | cenários CT-nn no formato acima |
| `02-xray-ids.json` | `qa/xray-criar-testes.mjs` | CT-nn → chave do Test no Xray |
| `03-specs.md` | prompt `qa-03` | lista dos specs gerados e status de revisão |
| `evidencias/` | `qa/evidencias-gerar.mjs` | `CT-nn.html`, `CT-nn.pdf`, `index.html` |
| `04-publicacao.json` | `qa/xray-publicar.mjs` | chave da Test Execution, anexos enviados |
