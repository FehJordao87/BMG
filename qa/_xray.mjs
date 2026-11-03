/**
 * qa/_xray.mjs — cliente mínimo do Xray Cloud (REST v2 + GraphQL) e leitura de segredos.
 * Sem dependências. Usado por xray-criar-testes.mjs e xray-publicar.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';

export const XRAY_API = process.env.XRAY_API_URL || 'https://xray.cloud.getxray.app/api/v2';

/** Procura uma chave em um objeto (qualquer profundidade), ignorando caixa, _ e -. */
function achar(obj, ...nomes) {
  const norm = (s) => String(s).toLowerCase().replace(/[-_\s]/g, '');
  const alvos = nomes.map(norm);
  const pilha = [obj];
  while (pilha.length) {
    const o = pilha.shift();
    if (!o || typeof o !== 'object') continue;
    for (const [k, v] of Object.entries(o)) {
      if (alvos.includes(norm(k)) && typeof v === 'string' && v) return v;
      if (v && typeof v === 'object') pilha.push(v);
    }
  }
  return '';
}

/**
 * Segredos: 1) variáveis de ambiente, 2) config/<TEST_ENV>-secrets.json, 3) config/hml-secrets.json.
 * Aceita chaves em qualquer formato: XRAY_CLIENT_ID, xrayClientId, xray.clientId, xray.client_id…
 * Nunca registre o valor em log.
 */
export function segredos() {
  const env = (process.env.TEST_ENV || 'hml').toLowerCase();
  const candidatos = [`config/${env}-secrets.json`, 'config/hml-secrets.json', 'config/secrets.json'];
  let arquivo = '';
  let json = {};
  for (const c of candidatos) {
    const p = path.resolve(c);
    if (fs.existsSync(p)) {
      json = JSON.parse(fs.readFileSync(p, 'utf-8'));
      arquivo = c;
      break;
    }
  }
  const s = {
    clientId: process.env.XRAY_CLIENT_ID || achar(json, 'XRAY_CLIENT_ID', 'xrayClientId', 'clientId', 'client_id'),
    clientSecret: process.env.XRAY_CLIENT_SECRET || achar(json, 'XRAY_CLIENT_SECRET', 'xrayClientSecret', 'clientSecret', 'client_secret'),
    projectKey: process.env.JIRA_PROJECT_KEY || achar(json, 'JIRA_PROJECT_KEY', 'jiraProjectKey', 'projectKey'),
    jiraUrl: process.env.JIRA_BASE_URL || achar(json.jira || {}, 'baseUrl', 'url') || achar(json, 'JIRA_BASE_URL', 'jiraUrl', 'jiraBaseUrl'),
    origem: arquivo || 'env',
  };
  if (!s.clientId || !s.clientSecret) {
    throw new Error(`XRAY_CLIENT_ID/SECRET não encontrados (procurei em env e ${candidatos.join(', ')}).`);
  }
  return s;
}

export class Xray {
  constructor(s, log = console.error) {
    this.s = s;
    this.log = log;
    this.jwt = '';
  }

  async autenticar() {
    const r = await fetch(`${XRAY_API}/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: this.s.clientId, client_secret: this.s.clientSecret }),
    });
    if (!r.ok) throw new Error(`Xray authenticate: HTTP ${r.status} — confira client id/secret (${this.s.origem})`);
    this.jwt = (await r.text()).replace(/^"|"$/g, '');
    this.log('Xray Cloud: autenticado ({{token}})');
    return this;
  }

  async graphql(query, variables = {}) {
    const r = await fetch(`${XRAY_API}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.jwt}` },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.errors?.length) {
      throw new Error(`Xray GraphQL: HTTP ${r.status} ${JSON.stringify(j.errors || j).slice(0, 800)}`);
    }
    return j.data;
  }

  /** Cria um Test do tipo Cucumber (Gherkin) no projeto, opcionalmente dentro de uma pasta do Test Repository. */
  async criarTestCucumber({ projectKey, summary, gherkin, folderPath, labels = [], description = '' }) {
    const q = `mutation ($summary:String!, $project:String!, $gherkin:String!, $folder:String, $labels:[String], $desc:String) {
      createTest(
        testType: { name: "Cucumber" },
        gherkin: $gherkin,
        folderPath: $folder,
        jira: { fields: { summary: $summary, description: $desc, labels: $labels, project: { key: $project } } }
      ) { test { issueId jira(fields: ["key"]) } warnings }
    }`;
    const d = await this.graphql(q, { summary, project: projectKey, gherkin, folder: folderPath || null, labels, desc: description });
    const t = d.createTest;
    return { issueId: t.test.issueId, key: t.test.jira.key, warnings: t.warnings || [] };
  }

  async adicionarAoTestPlan(testPlanIssueId, testIssueIds) {
    const q = `mutation ($plan:String!, $tests:[String]!) { addTestsToTestPlan(issueId: $plan, testIssueIds: $tests) { addedTests warning } }`;
    return (await this.graphql(q, { plan: testPlanIssueId, tests: testIssueIds })).addTestsToTestPlan;
  }

  /** issueId numérico a partir da chave (ex. CONSIG-900) — via JQL do Xray. */
  async issueIdPorChave(key) {
    const q = `query ($jql:String!) { getTests(jql: $jql, limit: 1) { results { issueId } } getTestPlans(jql: $jql, limit: 1) { results { issueId } } }`;
    const d = await this.graphql(q, { jql: `key = ${key}` });
    const id = d.getTestPlans?.results?.[0]?.issueId || d.getTests?.results?.[0]?.issueId;
    if (!id) throw new Error(`Não achei issueId para ${key} (é um Test Plan ou Test do Xray?)`);
    return id;
  }

  /** Importa JUnit → cria/atualiza Test Execution. Devolve { id, key }. */
  async importarJunit(xml, { projectKey, testPlanKey, testExecKey }) {
    const qs = new URLSearchParams({ projectKey });
    if (testPlanKey) qs.set('testPlanKey', testPlanKey);
    if (testExecKey) qs.set('testExecKey', testExecKey);
    const r = await fetch(`${XRAY_API}/import/execution/junit?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', Authorization: `Bearer ${this.jwt}` },
      body: xml,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Xray import junit: HTTP ${r.status} ${JSON.stringify(j).slice(0, 500)}`);
    return j; // { id, key, self }
  }

  /** Test runs de uma Test Execution: [{ id, status, testKey }]. */
  async testRuns(testExecIssueId) {
    const q = `query ($exec:[String]) { getTestRuns(testExecIssueIds: $exec, limit: 100) {
      results { id status { name } test { issueId jira(fields: ["key"]) } } } }`;
    const d = await this.graphql(q, { exec: [testExecIssueId] });
    return d.getTestRuns.results.map((r) => ({ id: r.id, status: r.status?.name, testKey: r.test?.jira?.key, testIssueId: r.test?.issueId }));
  }

  async anexarEvidencia(testRunId, { filename, mimeType, data }) {
    const q = `mutation ($run:String!, $ev:[AttachmentDataInput]!) { addEvidenceToTestRun(id: $run, evidence: $ev) { addedEvidence warning } }`;
    return (await this.graphql(q, { run: testRunId, ev: [{ filename, mimeType, data }] })).addEvidenceToTestRun;
  }

  async comentarTestRun(testRunId, comment) {
    const q = `mutation ($run:String!, $c:String!) { updateTestRunComment(id: $run, comment: $c) }`;
    return this.graphql(q, { run: testRunId, c: comment });
  }
}

/** Lê qa/target/<KEY>/01-cenarios.md → [{ ct, titulo, camada, projeto, tipo, origem, gherkin, massa }]. */
export function lerCenarios(arquivo) {
  const txt = fs.readFileSync(arquivo, 'utf-8');
  const blocos = txt.split(/^### (?=CT-\d+)/m).slice(1);
  return blocos.map((b) => {
    const [cab, ...resto] = b.split('\n');
    const corpo = resto.join('\n').split(/^## /m)[0]; // para no próximo título de nível 2 (Pendências)
    const m = cab.match(/^(CT-\d+)\s*[—-]\s*(.+)$/);
    const meta = (re) => (corpo.match(re) || [, ''])[1].trim();
    return {
      ct: m?.[1] || cab.trim(),
      titulo: (m?.[2] || '').trim(),
      camada: meta(/\*\*Camada:\*\*\s*([a-z]+)/i).toLowerCase(),
      projeto: meta(/\*\*Projeto:\*\*\s*([\w.-]+)/i),
      tipo: meta(/\*\*Tipo:\*\*\s*([\wçã-]+)/i).toLowerCase(),
      origem: meta(/\*\*Origem:\*\*\s*(.+)/),
      gherkin: (corpo.match(/```gherkin\s*\n([\s\S]*?)```/) || [, ''])[1].trim(),
      massa: meta(/\*\*Massa:\*\*\s*(.+)/),
    };
  }).filter((c) => c.gherkin);
}
