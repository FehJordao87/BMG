#!/usr/bin/env node
/**
 * qa/xray-publicar.mjs — publica a execução no Xray Cloud e anexa a evidência PDF a cada test run.
 *
 * Uso:  node qa/xray-publicar.mjs <KEY> [--plan CONSIG-900] [--exec CONSIG-950] [--junit reports/junit-results.xml] [--dry-run]
 *
 * Passos:
 *  1. Lê qa/target/<KEY>/evidencias/resumo.json (rode evidencias-gerar.mjs antes) e o JUnit.
 *  2. Filtra o JUnit só para os testcases da história (não publica teste de outra história junto).
 *  3. Importa o JUnit → Test Execution (nova, ou --exec para atualizar uma existente), vinculada ao --plan.
 *  4. Para cada test run da execução cuja chave bate com o Xray key da evidência: anexa o PDF e um comentário.
 *  5. Grava qa/target/<KEY>/04-publicacao.json e imprime o texto do comentário para a história (o Copilot posta via MCP).
 *
 * Nunca marca como passou o que o JUnit não marcou. Nunca publica sem confirmação.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { Xray, segredos } from './_xray.mjs';

const args = process.argv.slice(2);
const KEY = args.find((a) => !a.startsWith('--'));
if (!KEY) { console.error('Uso: node qa/xray-publicar.mjs <KEY> [--plan KEY] [--exec KEY] [--junit caminho] [--dry-run]'); process.exit(2); }
const opt = (n, d = '') => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DRY = args.includes('--dry-run');
const JUNIT = path.resolve(opt('--junit', 'reports/junit-results.xml'));
const dir = path.resolve(`qa/target/${KEY}`);
const ids = fs.existsSync(path.join(dir, '02-xray-ids.json')) ? JSON.parse(fs.readFileSync(path.join(dir, '02-xray-ids.json'), 'utf-8')) : { tests: {} };
const PLAN = opt('--plan', ids.plan || process.env.XRAY_TEST_PLAN_KEY || '');
const EXEC = opt('--exec', process.env.XRAY_TEST_EXECUTION_KEY || '');

const resumoP = path.join(dir, 'evidencias', 'resumo.json');
if (!fs.existsSync(resumoP)) { console.error(`${resumoP} não existe — rode: node qa/evidencias-gerar.mjs ${KEY}`); process.exit(1); }
if (!fs.existsSync(JUNIT)) { console.error(`${JUNIT} não existe — rode os testes com o reporter junit.`); process.exit(1); }
const resumo = JSON.parse(fs.readFileSync(resumoP, 'utf-8'));

// ── JUnit só desta história ───────────────────────────────────────────────────
const xml = fs.readFileSync(JUNIT, 'utf-8');
const casos = [...xml.matchAll(/<testcase\b[^>]*\/>|<testcase\b[^>]*>[\s\S]*?<\/testcase>/g)].map((m) => m[0]);
const meus = casos.filter((c) => c.includes(KEY));
if (!meus.length) { console.error(`Nenhum <testcase> com "${KEY}" em ${path.relative(process.cwd(), JUNIT)}.`); process.exit(1); }
const n = (re) => meus.filter((c) => re.test(c)).length;
const falhas = n(/<failure|<error/), pulados = n(/<skipped/), passou = meus.length - falhas - pulados;
const xmlFiltrado = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="${KEY}" tests="${meus.length}" failures="${falhas}" skipped="${pulados}">\n<testsuite name="${KEY}" tests="${meus.length}" failures="${falhas}" skipped="${pulados}">\n${meus.join('\n')}\n</testsuite>\n</testsuites>`;

// chave Xray por CT: do resumo (annotation) ou do 02-xray-ids.json
const chaveDe = (t) => t.xrayKey || ids.tests?.[t.ct]?.key || '';
const semChave = resumo.testes.filter((t) => !chaveDe(t));

console.error(`JUnit: ${meus.length} testcase(s) de ${KEY} — ${passou} passou, ${falhas} falhou, ${pulados} pulado`);
console.error(`Evidências: ${resumo.testes.length} CT(s) em ${path.relative(process.cwd(), path.dirname(resumoP))} (ambiente ${resumo.ambiente})`);
if (semChave.length) console.error(`AVISO: sem chave Xray (não receberão PDF): ${semChave.map((t) => t.ct).join(', ')}`);
console.error(`Destino: ${EXEC ? 'atualizar ' + EXEC : 'nova Test Execution'}${PLAN ? ' no Test Plan ' + PLAN : ''} · projeto ${process.env.JIRA_PROJECT_KEY || KEY.split('-')[0]}`);
for (const t of resumo.testes) console.error(`  ${t.ct} ${t.status.padEnd(8)} ${chaveDe(t) || '—'}  ${t.pdf || t.html}`);

if (DRY) { fs.writeFileSync(path.join(dir, '04-junit-filtrado.xml'), xmlFiltrado); console.error(`\n--dry-run: JUnit filtrado salvo em 04-junit-filtrado.xml; nada publicado.`); process.exit(0); }

const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
const ok = (await rl.question(`\nPublicar no Xray? [s/N] `)).trim().toLowerCase();
rl.close();
if (ok !== 's') { console.error('Cancelado.'); process.exit(0); }

const s = segredos();
const x = await new Xray(s).autenticar();
const projectKey = s.projectKey || process.env.JIRA_PROJECT_KEY || KEY.split('-')[0];

const imp = await x.importarJunit(xmlFiltrado, { projectKey, testPlanKey: PLAN || undefined, testExecKey: EXEC || undefined });
console.error(`Test Execution: ${imp.key} (id ${imp.id})`);

const runs = await x.testRuns(String(imp.id));
const pub = { key: KEY, testExecution: imp.key, testExecutionId: imp.id, plan: PLAN || null, ambiente: resumo.ambiente, publicadoEm: new Date().toISOString(), anexos: [] };
for (const t of resumo.testes) {
  const chave = chaveDe(t);
  const run = runs.find((r) => r.testKey === chave);
  if (!chave || !run) { pub.anexos.push({ ct: t.ct, chave, ok: false, motivo: chave ? 'test run não encontrado na execução' : 'sem chave Xray' }); continue; }
  const arq = path.join(dir, 'evidencias', t.pdf || t.html);
  try {
    const data = fs.readFileSync(arq).toString('base64');
    await x.anexarEvidencia(run.id, { filename: `${KEY}-${t.ct}.${t.pdf ? 'pdf' : 'html'}`, mimeType: t.pdf ? 'application/pdf' : 'text/html', data });
    await x.comentarTestRun(run.id, `Evidência ${t.ct} · ambiente ${resumo.ambiente} · execução ${t.inicio} · resultado no Playwright: ${t.status}`);
    pub.anexos.push({ ct: t.ct, chave, testRunId: run.id, statusXray: run.status, ok: true });
    console.error(`✔ ${t.ct} → ${chave} (${run.status}) PDF anexado`);
  } catch (e) {
    pub.anexos.push({ ct: t.ct, chave, ok: false, motivo: e.message });
    console.error(`✖ ${t.ct} → ${chave}: ${e.message}`);
  }
}
fs.writeFileSync(path.join(dir, '04-publicacao.json'), JSON.stringify(pub, null, 2));

const jira = (s.jiraUrl || '').replace(/\/+$/, '');
const link = (k) => (jira ? `${jira}/browse/${k}` : k);
console.log(`\n===== comentário para a história ${KEY} (cole no Jira ou peça ao Copilot para postar via MCP) =====
Execução de testes — ambiente ${resumo.ambiente} — ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
Test Execution: ${link(imp.key)}${PLAN ? `\nTest Plan: ${link(PLAN)}` : ''}
Resultado: ${passou} passou · ${falhas} falhou · ${pulados} pulado (de ${meus.length})
${resumo.testes.map((t) => `- ${t.ct} ${chaveDe(t) ? link(chaveDe(t)) : ''} — ${t.status}`).join('\n')}
Evidências (HTML/PDF) anexadas a cada teste na execução.
=====`);
