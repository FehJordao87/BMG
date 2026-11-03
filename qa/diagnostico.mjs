#!/usr/bin/env node
/**
 * qa/diagnostico.mjs — retrato do repositório de automação para calibrar o fluxo de QA.
 *
 * Uso (na raiz do repo de automação):  node qa/diagnostico.mjs > qa-diagnostico.txt
 * Cole o conteúdo de qa-diagnostico.txt na conversa. Não contém valores de segredo:
 * de arquivos .env/secrets só saem os NOMES das chaves; URLs ficam com o host mascarado.
 */
import fs from 'node:fs';
import path from 'node:path';

const raiz = process.cwd();
const out = [];
const p = (s = '') => out.push(s);
const existe = (f) => fs.existsSync(path.join(raiz, f));
const ler = (f, max = 6000) => { try { return fs.readFileSync(path.join(raiz, f), 'utf-8').slice(0, max); } catch { return ''; } };
const mascarar = (t) => t.replace(/https?:\/\/[^\s"'`,)]+/g, (u) => { try { const x = new URL(u); return `${x.protocol}//{{host}}${x.pathname}`; } catch { return '{{url}}'; } });
const IGNORAR = new Set(['node_modules', '.git', 'reports', 'test-results', 'playwright-report', 'dist', 'build', '.venv', '__pycache__', 'coverage']);

function arvore(dir, prof = 0, max = 3) {
  if (prof > max) return;
  let itens = [];
  try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  itens.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
  let n = 0;
  for (const it of itens) {
    if (IGNORAR.has(it.name)) continue;
    if (++n > 40) { p(`${'  '.repeat(prof)}… (+${itens.length - 40})`); break; }
    p(`${'  '.repeat(prof)}${it.isDirectory() ? '📁 ' : ''}${it.name}`);
    if (it.isDirectory()) arvore(path.join(dir, it.name), prof + 1, max);
  }
}
function achar(dir, re, acc = [], prof = 0) {
  if (prof > 6) return acc;
  let itens = [];
  try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const it of itens) {
    if (IGNORAR.has(it.name)) continue;
    const f = path.join(dir, it.name);
    if (it.isDirectory()) achar(f, re, acc, prof + 1);
    else if (re.test(it.name)) acc.push(path.relative(raiz, f));
  }
  return acc;
}

p(`# Diagnóstico do repositório — ${path.basename(raiz)} — ${new Date().toISOString()}`);
p(`node ${process.version} · plataforma ${process.platform}`);

p('\n## 1. Árvore (3 níveis)');
arvore(raiz);

p('\n## 2. package.json (scripts e dependências)');
if (existe('package.json')) {
  const pk = JSON.parse(ler('package.json', 100000));
  p(`nome: ${pk.name}`);
  p('scripts:'); for (const [k, v] of Object.entries(pk.scripts || {})) p(`  ${k}: ${v}`);
  p('dependencies: ' + Object.keys(pk.dependencies || {}).join(', '));
  p('devDependencies: ' + Object.keys(pk.devDependencies || {}).join(', '));
} else p('(sem package.json — não é projeto Node? Cypress/Robot/outro?)');

p('\n## 3. Configuração do runner');
for (const f of ['playwright.config.ts', 'playwright.config.js', 'cypress.config.ts', 'cypress.config.js', 'robot.yaml', 'pytest.ini', 'tsconfig.json']) {
  if (existe(f)) { p(`\n### ${f}`); p('```'); p(mascarar(ler(f))); p('```'); }
}

p('\n## 4. Fixtures, page objects, utilitários (lista)');
for (const re of [/fixture/i, /page/i, /util|helper|support/i]) {
  const l = achar(raiz, re).filter((f) => /\.(ts|js|mjs|py)$/.test(f)).slice(0, 30);
  if (l.length) p(l.join('\n'));
}

p('\n## 5. Specs existentes (lista + 1 exemplo inteiro)');
const specs = achar(raiz, /\.(spec|test|cy)\.(ts|js)$|\.robot$|_test\.py$/).slice(0, 60);
p(specs.join('\n') || '(nenhum spec encontrado)');
const exemplo = specs.find((s) => /\.(spec|test)\.(ts|js)$/.test(s)) || specs[0];
if (exemplo) { p(`\n### Exemplo: ${exemplo}`); p('```'); p(mascarar(ler(exemplo, 5000))); p('```'); }

p('\n## 6. Fixture principal (se houver)');
const fx = achar(raiz, /^(test|fixtures?|base)\.(ts|js)$/).find((f) => /fixture|support|src/i.test(f)) || achar(raiz, /fixture/i).find((f) => /\.(ts|js)$/.test(f));
if (fx) { p(`### ${fx}`); p('```'); p(mascarar(ler(fx, 4000))); p('```'); } else p('(não encontrei)');

p('\n## 7. Integração com Jira/Xray já existente');
const xr = achar(raiz, /xray|jira/i);
p(xr.join('\n') || '(nenhum arquivo com xray/jira no nome)');
const grepXray = [];
for (const f of [...specs.slice(0, 20), ...achar(raiz, /\.(ts|js|mjs)$/).filter((f) => /util|script|report/i.test(f)).slice(0, 30)]) {
  const t = ler(f, 20000);
  if (/xray|testKey|test_key|requirement/i.test(t)) grepXray.push(f);
}
p('arquivos que citam xray/testKey/requirement: ' + (grepXray.join(', ') || 'nenhum'));

p('\n## 8. Segredos e ambiente — só NOMES de chaves');
for (const f of ['.env', '.env.example', '.env.local', ...achar(raiz, /secrets?\.json$|\.env\./i)]) {
  if (!existe(f)) continue;
  p(`\n### ${f}`);
  const t = ler(f, 20000);
  if (f.endsWith('.json')) {
    const chaves = [];
    const andar = (o, pre = '') => { for (const [k, v] of Object.entries(o || {})) (v && typeof v === 'object' && !Array.isArray(v)) ? andar(v, pre + k + '.') : chaves.push(pre + k); };
    try { andar(JSON.parse(t)); } catch { chaves.push('(json inválido)'); }
    p(chaves.join('\n'));
  } else {
    p(t.split('\n').map((l) => l.replace(/^(\s*[A-Za-z_][A-Za-z0-9_]*)\s*=.*$/, '$1=…')).join('\n'));
  }
}

p('\n## 9. Reporters e saídas');
const cfg = ler('playwright.config.ts') || ler('playwright.config.js') || ler('cypress.config.ts') || ler('cypress.config.js');
p('reporter json: ' + (/['"]json['"]/.test(cfg) ? 'sim' : 'NÃO (evidencias-gerar.mjs precisa)'));
p('reporter junit: ' + (/['"]junit['"]/.test(cfg) ? 'sim' : 'NÃO (xray-publicar.mjs precisa)'));
p('pastas de saída existentes: ' + ['reports', 'test-results', 'playwright-report', 'cypress/reports', 'results'].filter(existe).join(', '));

p('\n## 10. Copilot');
p('.github/copilot-instructions.md: ' + (existe('.github/copilot-instructions.md') ? 'JÁ EXISTE (não sobrescrever — mesclar)' : 'não existe'));
p('.github/prompts/: ' + (existe('.github/prompts') ? fs.readdirSync(path.join(raiz, '.github/prompts')).join(', ') : 'não existe'));
p('.vscode/mcp.json: ' + (existe('.vscode/mcp.json') ? mascarar(ler('.vscode/mcp.json', 2000)) : 'não existe'));

process.stdout.write(out.join('\n') + '\n');
