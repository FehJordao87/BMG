#!/usr/bin/env node
/**
 * qa/xray-criar-testes.mjs — cria os CTs de 01-cenarios.md como issues "Test" (Cucumber) no Xray Cloud.
 *
 * Uso:  node qa/xray-criar-testes.mjs <KEY> [--pasta "/NovoConsig/Consig Mais"] [--plan CONSIG-900] [--so CT-01,CT-03] [--dry-run]
 *
 * Regras:
 *  - Idempotente: CT que já tem chave em 02-xray-ids.json não é criado de novo.
 *  - --dry-run mostra exatamente o que seria criado e não chama o Xray.
 *  - Sem --dry-run, pede confirmação no terminal antes de criar (um "s" para o lote; cada Test é listado antes).
 *  - Vínculo Test → história: o Xray cria no import do JUnit (property `requirement` do linkToXray).
 *    Se quiser o vínculo já agora, peça ao Copilot (MCP Atlassian) para linkar as chaves listadas em 02-xray-ids.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { Xray, segredos, lerCenarios } from './_xray.mjs';

const args = process.argv.slice(2);
const KEY = args.find((a) => !a.startsWith('--'));
if (!KEY) {
  console.error('Uso: node qa/xray-criar-testes.mjs <KEY> [--pasta /caminho] [--plan KEY] [--so CT-01,CT-02] [--dry-run]');
  process.exit(2);
}
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : ''; };
const PASTA = opt('--pasta');
const PLAN = opt('--plan');
const SO = opt('--so') ? opt('--so').split(',').map((s) => s.trim().toUpperCase()) : null;
const DRY = args.includes('--dry-run');

const dir = path.resolve(`qa/target/${KEY}`);
const arqCen = path.join(dir, '01-cenarios.md');
const arqIds = path.join(dir, '02-xray-ids.json');
if (!fs.existsSync(arqCen)) { console.error(`${arqCen} não existe — rode /qa-02-gerar-cenarios antes.`); process.exit(1); }

const ids = fs.existsSync(arqIds) ? JSON.parse(fs.readFileSync(arqIds, 'utf-8')) : { key: KEY, pasta: PASTA, plan: PLAN, tests: {} };
if (PASTA) ids.pasta = PASTA;
if (PLAN) ids.plan = PLAN;

const todos = lerCenarios(arqCen);
const pendentes = todos.filter((c) => (!SO || SO.includes(c.ct)) && !ids.tests[c.ct]?.key);
const jaCriados = todos.filter((c) => ids.tests[c.ct]?.key);

console.error(`${todos.length} CT(s) em 01-cenarios.md · ${jaCriados.length} já no Xray · ${pendentes.length} a criar`);
if (!pendentes.length) { console.error('Nada a criar.'); process.exit(0); }

const projectKey = process.env.JIRA_PROJECT_KEY || KEY.split('-')[0];
const summary = (c) => `${KEY} ${c.ct} — ${c.titulo}`;
const description = (c) => [
  `Origem: ${c.origem || '—'}`,
  `Camada: ${c.camada || '—'} · Projeto Playwright: ${c.projeto || '—'} · Tipo: ${c.tipo || '—'}`,
  c.massa ? `Massa: ${c.massa}` : '',
  `Gerado por qa/xray-criar-testes.mjs a partir de qa/target/${KEY}/01-cenarios.md`,
].filter(Boolean).join('\n');
const labels = (c) => ['qa-copilot', c.camada, c.tipo].filter(Boolean);

for (const c of pendentes) {
  console.error(`\n── ${summary(c)}\n   pasta: ${ids.pasta || '(raiz)'} · plan: ${ids.plan || '(nenhum)'} · labels: ${labels(c).join(', ')}\n${c.gherkin.split('\n').map((l) => '   ' + l).join('\n')}`);
}
if (DRY) { console.error('\n--dry-run: nada foi criado.'); process.exit(0); }

const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
const ok = (await rl.question(`\nCriar ${pendentes.length} Test(s) no projeto ${projectKey}? [s/N] `)).trim().toLowerCase();
rl.close();
if (ok !== 's') { console.error('Cancelado.'); process.exit(0); }

const x = await new Xray(segredos()).autenticar();
let planId = '';
if (ids.plan) planId = await x.issueIdPorChave(ids.plan);

const criados = [];
for (const c of pendentes) {
  try {
    const r = await x.criarTestCucumber({ projectKey, summary: summary(c), gherkin: c.gherkin, folderPath: ids.pasta || undefined, labels: labels(c), description: description(c) });
    ids.tests[c.ct] = { key: r.key, issueId: r.issueId, titulo: c.titulo, criadoEm: new Date().toISOString() };
    criados.push(r.issueId);
    console.error(`✔ ${c.ct} → ${r.key}${r.warnings.length ? ' (avisos: ' + r.warnings.join('; ') + ')' : ''}`);
    fs.writeFileSync(arqIds, JSON.stringify(ids, null, 2)); // grava a cada um: falha no meio não perde o que já foi
  } catch (e) {
    console.error(`✖ ${c.ct}: ${e.message}`);
  }
}
if (planId && criados.length) {
  const r = await x.adicionarAoTestPlan(planId, criados);
  console.error(`Test Plan ${ids.plan}: ${r.addedTests?.length ?? 0} adicionados${r.warning ? ' — ' + r.warning : ''}`);
}
console.error(`\n02-xray-ids.json atualizado. Próximo: /qa-03-gerar-spec usa essas chaves no linkToXray.`);
