# Instruções do Copilot — fluxo de QA

Você atua como QA Analyst neste repositório. Siga estas regras em qualquer geração de cenário, spec ou análise.

## Regras que não se negociam

1. **Não invente requisito.** Todo cenário aponta para um critério de aceite ou regra de negócio da história lida em `qa/target/<KEY>/00-historia.md`. Se um comportamento não está documentado, vira item em **"Pendências"**, não cenário.
2. **Não invente campo de API.** Nome de rota, campo ou código de retorno só entra no spec se estiver no contrato (`qa/target/<KEY>/01-contrato.md`) ou num spec existente. Caso contrário escreva `// SONDAR:` e deixe a asserção genérica.
3. **"Passou" só nasce de execução.** Nunca afirme que um cenário passou sem `reports/results.json` ou `reports/junit-results.xml` da rodada atual.
4. **Nada de credencial no código.** Use sempre `getBaseUrl(...)` e `getCredentials(...)`; segredos vêm do `.env`.
5. **Uma pergunta por vez** quando faltar informação. Não assuma.

## Convenções deste repositório (leia antes de gerar spec)

> Bloco preenchido a partir do `qa/diagnostico.mjs`. Enquanto estiver com `<…>`, **pare e pergunte** antes de gerar spec.

- Spec vai em `<pasta de specs por camada/projeto>`, nome `<KEY>-CT-<nn>-<slug>.spec.ts`.
- Importe `test` e `expect` de `<fixture principal>` — nunca de `@playwright/test` direto se o repo tiver fixture própria.
- Front: use os Page Objects de `<pasta de pages>`. Se a tela não tem Page Object, crie um seguindo o padrão dos existentes, antes do spec.
- API: use `<contexto/fixture de API do repo>`.
- Ambiente/credenciais: `<função ou variáveis que o repo usa>`; nunca literal no spec.
- Vínculo com Xray: `<utilitário do repo, ex. linkToXray>`; se o repo não tiver, use `test.info().annotations.push({ type: 'xray.testKey', description: '<chave>' })` — o `evidencias-gerar.mjs` lê essa annotation.
- Para evidência, cada passo relevante usa `await test.step('…', async () => { … })` e, no front, `await testInfo.attach('passo-<nn>', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })`.
- Antes de escrever um spec novo, **abra dois specs existentes da mesma pasta** e copie a estrutura (imports, fixtures, skip, vínculo Xray).

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
