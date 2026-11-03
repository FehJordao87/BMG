---
mode: agent
description: Gera o spec Playwright de um ou mais CTs já aprovados, seguindo as convenções do repositório
---

Gere o spec Playwright para **${input:ct:CT ou lista (ex. CT-01 ou CT-01,CT-03 ou todos)}** da história **${input:key:Chave da história}**.

## Antes de escrever uma linha

1. Leia `qa/target/${input:key}/01-cenarios.md` e pegue só os CTs pedidos.
2. Leia `qa/target/${input:key}/02-xray-ids.json` se existir — ele tem a chave do Test no Xray de cada CT. Sem ele, use `testKey: 'PENDENTE'`.
3. Abra `src/config/projects.ts` (chaves de `PROJECTS`), `src/fixtures/test.ts` e o spec existente da mesma camada (`tests/api/acps-host-multiproduto-bff/multiproduto.spec.ts` ou `tests/frontend/bmg-consig-mais-front/login.spec.ts`). Copie o jeito deles: imports relativos, `test.skip(!getBaseUrl(project), …)`, `readEnvVar(project.envPrefix, …)` para rotas, `apiContextFor`/`loginPageFor`/`homePageFor`, objeto `XRAY`.
4. Se um CT de front precisa de uma tela sem Page Object, crie `src/pages/<Tela>Page.ts` primeiro, com o padrão dos existentes, e **pare para eu revisar** antes do spec.

## Regras do spec

- Um arquivo por CT: `tests/<camada>/<projeto>/${input:key}-CT-<nn>-<slug>.spec.ts`.
- Título do `test(...)`: `'${input:key} CT-<nn> — <título do CT>'`.
- Primeira linha do teste: `linkToXray(testInfo, { testKey: XRAY.ct<nn>, requirement: '${input:key}' })`, com `const XRAY = { ct01: '<chave>', … }` no topo do spec.
- Cada linha Dado/Quando/Então vira um `await test.step('Dado …', async () => { … })`. Dentro de passo de front que muda a tela, anexe screenshot: `await testInfo.attach('passo-<nn>', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })`.
- Em API, anexe request e response como texto: `await testInfo.attach('request-<nn>', { body: JSON.stringify(req, null, 2), contentType: 'application/json' })` e o mesmo para a resposta (o `qa/evidencias-gerar.mjs` mascara `baseURL` e `Authorization`).
- Asserção só sobre o que o CT afirma. Campo marcado `(sondar)` no cenário vira `// SONDAR: confirmar nome do campo` e asserção genérica (`toBeTruthy`/`toHaveProperty` só se o nome for certo).
- Nunca `test.skip` dentro do teste por falta de massa — o teste deve **falhar** com mensagem clara (`throw new Error('Massa ausente: …')`). Skip só por ambiente não configurado.
- Sem `waitForTimeout`. Use `expect(...).toBeVisible()` / `waitForResponse`.

## Saída

- Os arquivos `.spec.ts` gerados (e Page Objects novos, se houver).
- Atualize `qa/target/${input:key}/03-specs.md` com uma linha por CT: `CT-nn · <caminho do spec> · gerado em <data> · revisão: pendente`.
- Se criou variável nova de rota, adicione a linha no `.env.example` (sem valor).
- Rode `npm run typecheck`. Se falhar, corrija antes de me mostrar.
- Mostre o comando para rodar só esses specs: `npx playwright test tests/<...>/${input:key}-CT-*.spec.ts --project=<projeto>` (com `TEST_ENV` que eu informar).

Não execute os testes sem eu pedir.
