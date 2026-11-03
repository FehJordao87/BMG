#!/usr/bin/env node
/**
 * qa/evidencias-gerar.mjs — evidência HTML + PDF por CT a partir do reports/results.json do Playwright.
 *
 * Uso:  node qa/evidencias-gerar.mjs <KEY> [--results reports/results.json] [--sem-pdf] [--saida qa/target/<KEY>/evidencias]
 *
 * Regras:
 *  - Só o que está no results.json entra. Nada é inferido.
 *  - URL base e header Authorization são mascarados ({{base_url}}, {{token}}) em todo texto exibido.
 *  - Um CT sem resultado na rodada aparece no índice como "não executado" — nunca como passou.
 *  - Sem rede. Sem Jira. Só arquivos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const KEY = args.find((a) => !a.startsWith('--'));
if (!KEY) {
  console.error('Uso: node qa/evidencias-gerar.mjs <KEY> [--results caminho] [--sem-pdf] [--saida pasta]');
  process.exit(2);
}
const opt = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};
const RESULTS = path.resolve(opt('--results', 'reports/results.json'));
const SAIDA = path.resolve(opt('--saida', `qa/target/${KEY}/evidencias`));
const SEM_PDF = args.includes('--sem-pdf');
const AMBIENTE = process.env.TEST_ENV || 'não informado';

if (!fs.existsSync(RESULTS)) {
  console.error(`results.json não encontrado em ${RESULTS}. Rode os testes com o reporter json antes.`);
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(RESULTS, 'utf-8'));
const geradoEm = new Date();
const idadeMin = Math.round((geradoEm - fs.statSync(RESULTS).mtime) / 60000);

// ── máscara ──────────────────────────────────────────────────────────────────
const hosts = new Set();
for (const p of raw.config?.projects || []) {
  const u = p.use?.baseURL;
  if (u) hosts.add(u.replace(/\/+$/, ''));
}
for (const [k, v] of Object.entries(process.env)) {
  if (/_URL(_|$)/.test(k) && /^https?:\/\//.test(v || '')) hosts.add(v.replace(/\/+$/, ''));
}
const hostsOrdenados = [...hosts].sort((a, b) => b.length - a.length);
function mascarar(txt) {
  if (typeof txt !== 'string') return txt;
  let t = txt;
  for (const h of hostsOrdenados) t = t.split(h).join('{{base_url}}');
  t = t.replace(/("?authorization"?\s*[:=]\s*"?)(Bearer\s+)?[A-Za-z0-9\-._~+/]+=*("?)/gi, '$1$2{{token}}$3');
  t = t.replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/g, '$1{{token}}');
  t = t.replace(/("?(password|senha|client_secret|secret)"?\s*[:=]\s*")[^"]+(")/gi, '$1{{oculto}}$3');
  t = t.replace(/(cookie"?\s*[:=]\s*"?)[^"\n]+/gi, '$1{{oculto}}');
  return t;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── coleta de testes da história ─────────────────────────────────────────────
const testes = [];
function andar(suite, arquivo) {
  const file = suite.file || arquivo;
  for (const spec of suite.specs || []) {
    const titulo = spec.title || '';
    const pertence = titulo.includes(KEY) || (spec.file || file || '').includes(KEY);
    if (!pertence) continue;
    for (const t of spec.tests || []) {
      const r = (t.results || []).at(-1); // última tentativa (retry) é a que vale
      if (!r) continue;
      const ct = (titulo.match(/CT-(\d{2,})/i) || [, '??'])[1];
      const xray = (t.annotations || []).find((a) => /xray|test[_-]?key/i.test(a.type || ''));
      testes.push({
        ct: `CT-${ct}`,
        titulo,
        arquivo: spec.file || file,
        projeto: t.projectName || t.projectId || '',
        status: r.status, // passed | failed | timedOut | skipped | interrupted
        duracaoMs: r.duration,
        inicio: r.startTime,
        tentativas: (t.results || []).length,
        erro: r.error?.message || r.errors?.map((e) => e.message).join('\n\n') || '',
        passos: r.steps || [],
        anexos: r.attachments || [],
        xrayKey: xray?.description || '',
      });
    }
  }
  for (const s of suite.suites || []) andar(s, file);
}
for (const s of raw.suites || []) andar(s, s.file);
testes.sort((a, b) => a.ct.localeCompare(b.ct) || a.projeto.localeCompare(b.projeto));

if (!testes.length) {
  console.error(`Nenhum teste com "${KEY}" no título ou no caminho dentro de ${RESULTS}.`);
  process.exit(1);
}

// ── render ───────────────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;margin:0;background:#f4f6f9;color:#222;font-size:13px}
.hdr{background:#f26122;color:#fff;padding:18px 28px}.hdr h1{margin:0 0 4px;font-size:20px}.hdr .meta{opacity:.95;font-size:12px}
.wrap{padding:20px 28px;max-width:1100px;margin:0 auto}
.kpi{display:flex;gap:12px;margin:14px 0}.kpi div{background:#fff;border-radius:6px;padding:10px 14px;min-width:120px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.kpi b{display:block;font-size:20px}.ok{color:#1e8e3e}.ko{color:#c62828}.sk{color:#8a6d00}.na{color:#777}
table{width:100%;border-collapse:collapse;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08)}th,td{padding:8px 10px;border-bottom:1px solid #e6e6e6;text-align:left;vertical-align:top}th{background:#fafafa}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;color:#fff}.b-ok{background:#1e8e3e}.b-ko{background:#c62828}.b-sk{background:#b58900}.b-na{background:#888}
.passo{border-left:3px solid #cfd8dc;margin:10px 0;padding:6px 12px;background:#fff;border-radius:0 6px 6px 0}.passo.ko{border-left-color:#c62828}.passo .t{font-weight:600}.passo .d{color:#777;font-size:11px;margin-left:8px}
.passo .passo{margin-left:14px}
img.shot{max-width:100%;border:1px solid #ddd;border-radius:4px;margin:8px 0;page-break-inside:avoid}
pre{background:#f6f8fa;border:1px solid #d0d7de;border-left:3px solid #0078d4;border-radius:4px;padding:10px 14px;font:12px Consolas,'Courier New',monospace;white-space:pre-wrap;word-break:break-word}
pre.erro{border-left-color:#c62828;background:#fff5f5}pre.resp{border-left-color:#2ea043}
.nota{color:#666;font-size:11px;margin-top:18px}
@media print{.hdr{-webkit-print-color-adjust:exact;print-color-adjust:exact}.passo,pre,img{page-break-inside:avoid}}
`;
const badge = (s) => {
  const m = { passed: ['b-ok', 'PASSOU'], failed: ['b-ko', 'FALHOU'], timedOut: ['b-ko', 'TIMEOUT'], interrupted: ['b-ko', 'INTERROMPIDO'], skipped: ['b-sk', 'PULADO'] }[s] || ['b-na', s];
  return `<span class="badge ${m[0]}">${m[1]}</span>`;
};
const fmtData = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
const fmtDur = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms ?? 0} ms`);

function lerAnexo(a) {
  if (a.body) return Buffer.from(a.body, 'base64');
  if (a.path && fs.existsSync(a.path)) return fs.readFileSync(a.path);
  const rel = a.path && path.resolve(path.dirname(RESULTS), a.path);
  if (rel && fs.existsSync(rel)) return fs.readFileSync(rel);
  return null;
}
function renderAnexo(a) {
  const buf = lerAnexo(a);
  if (!buf) return `<p class="nota">anexo <code>${esc(a.name)}</code> não encontrado em disco</p>`;
  const ct = a.contentType || '';
  if (ct.startsWith('image/')) return `<figure><figcaption>${esc(a.name)}</figcaption><img class="shot" src="data:${ct};base64,${buf.toString('base64')}"></figure>`;
  if (/json|text|xml|html/.test(ct)) {
    const cls = /resp/i.test(a.name) ? 'resp' : '';
    return `<p><b>${esc(a.name)}</b></p><pre class="${cls}">${esc(mascarar(buf.toString('utf-8')).slice(0, 20000))}</pre>`;
  }
  if (/video|zip/.test(ct)) return `<p class="nota">${esc(a.name)} (${esc(ct)}) — disponível em <code>${esc(a.path || 'inline')}</code>, não embutido</p>`;
  return `<p class="nota">${esc(a.name)} (${esc(ct)})</p>`;
}
function renderPasso(p) {
  if (/^(Before|After) Hooks$/i.test(p.title) && !(p.steps || []).some((s) => s.error)) return '';
  const falhou = !!p.error;
  return `<div class="passo ${falhou ? 'ko' : ''}"><span class="t">${esc(mascarar(p.title))}</span><span class="d">${fmtDur(p.duration)}</span>
    ${falhou ? `<pre class="erro">${esc(mascarar(p.error.message || ''))}</pre>` : ''}
    ${(p.steps || []).map(renderPasso).join('')}</div>`;
}

function htmlCT(t) {
  // anexos ligados a passos não vêm referenciados no json — mostramos todos, na ordem, após os passos
  const shots = t.anexos.filter((a) => !/^(trace|video)$/i.test(a.name));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(KEY)} ${esc(t.ct)}</title><style>${CSS}</style></head><body>
<div class="hdr"><h1>${esc(KEY)} · ${esc(t.ct)} — ${esc(mascarar(t.titulo).replace(/^.*?CT-\d+\s*[—-]?\s*/i, ''))}</h1>
<div class="meta">Projeto: <b>${esc(t.projeto)}</b> · Ambiente: <b>${esc(AMBIENTE)}</b> · Execução: ${fmtData(t.inicio)} · Duração: ${fmtDur(t.duracaoMs)}${t.tentativas > 1 ? ` · tentativas: ${t.tentativas}` : ''}${t.xrayKey ? ` · Xray: <b>${esc(t.xrayKey)}</b>` : ''}</div></div>
<div class="wrap">
<p>Resultado: ${badge(t.status)} &nbsp; <span class="nota">origem: EXECUCAO@${esc(t.inicio || '')} · arquivo <code>${esc(t.arquivo)}</code></span></p>
${t.erro ? `<h3>Erro</h3><pre class="erro">${esc(mascarar(t.erro))}</pre>` : ''}
<h3>Passos</h3>${t.passos.map(renderPasso).join('') || '<p class="nota">sem test.step registrado</p>'}
<h3>Anexos (${shots.length})</h3>${shots.map(renderAnexo).join('') || '<p class="nota">nenhum anexo</p>'}
<p class="nota">Gerado por qa/evidencias-gerar.mjs em ${fmtData(geradoEm.toISOString())} a partir de <code>${esc(path.relative(process.cwd(), RESULTS))}</code> (${idadeMin} min atrás). <code>{{base_url}}</code> e <code>{{token}}</code> substituem valores reais.</p>
</div></body></html>`;
}

function htmlIndex(lista) {
  const n = (s) => lista.filter((t) => t.status === s).length;
  const falhas = lista.length - n('passed') - n('skipped');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Evidências ${esc(KEY)}</title><style>${CSS}</style></head><body>
<div class="hdr"><h1>Evidências de teste — ${esc(KEY)}</h1><div class="meta">Ambiente: <b>${esc(AMBIENTE)}</b> · Gerado: ${fmtData(geradoEm.toISOString())} · Fonte: results.json de ${fmtData(fs.statSync(RESULTS).mtime.toISOString())}</div></div>
<div class="wrap">
<div class="kpi"><div><b>${lista.length}</b>testes</div><div class="ok"><b>${n('passed')}</b>passaram</div><div class="ko"><b>${falhas}</b>falharam</div><div class="sk"><b>${n('skipped')}</b>pulados</div></div>
<table><tr><th>CT</th><th>Título</th><th>Projeto</th><th>Xray</th><th>Resultado</th><th>Duração</th><th>Evidência</th></tr>
${lista.map((t) => `<tr><td>${esc(t.ct)}</td><td>${esc(mascarar(t.titulo))}</td><td>${esc(t.projeto)}</td><td>${esc(t.xrayKey || '—')}</td><td>${badge(t.status)}</td><td>${fmtDur(t.duracaoMs)}</td><td><a href="${t.arq}.html">html</a>${SEM_PDF ? '' : ` · <a href="${t.arq}.pdf">pdf</a>`}</td></tr>`).join('')}
</table>
<p class="nota">Um CT ausente desta lista <b>não foi executado</b> nesta rodada. "Passou" só aparece para <code>status: passed</code> do results.json.</p>
</div></body></html>`;
}

// ── grava ────────────────────────────────────────────────────────────────────
fs.mkdirSync(SAIDA, { recursive: true });
const resumo = [];
for (const t of testes) {
  const sufixo = testes.filter((x) => x.ct === t.ct).length > 1 ? `-${t.projeto.replace(/[^a-z0-9]+/gi, '_')}` : '';
  t.arq = `${t.ct}${sufixo}`;
  fs.writeFileSync(path.join(SAIDA, `${t.arq}.html`), htmlCT(t), 'utf-8');
  resumo.push({ ct: t.ct, titulo: t.titulo, projeto: t.projeto, status: t.status, xrayKey: t.xrayKey, inicio: t.inicio, html: `${t.arq}.html`, pdf: SEM_PDF ? null : `${t.arq}.pdf` });
}
fs.writeFileSync(path.join(SAIDA, 'index.html'), htmlIndex(testes), 'utf-8');
fs.writeFileSync(path.join(SAIDA, 'resumo.json'), JSON.stringify({ key: KEY, ambiente: AMBIENTE, geradoEm: geradoEm.toISOString(), results: path.relative(process.cwd(), RESULTS), testes: resumo }, null, 2), 'utf-8');

if (!SEM_PDF) {
  // resolve a partir do repositório (node_modules do novoconsig-e2e), com fallback global
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(process.cwd(), 'package.json'));
  let chromium;
  try {
    ({ chromium } = req('@playwright/test'));
  } catch {
    ({ chromium } = req('playwright'));
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const t of testes) {
    await page.goto('file://' + path.join(SAIDA, `${t.arq}.html`));
    await page.pdf({ path: path.join(SAIDA, `${t.arq}.pdf`), format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
  }
  await page.goto('file://' + path.join(SAIDA, 'index.html'));
  await page.pdf({ path: path.join(SAIDA, 'index.pdf'), format: 'A4', printBackground: true });
  await browser.close();
}

const ok = testes.filter((t) => t.status === 'passed').length;
console.log(`${testes.length} teste(s) de ${KEY}: ${ok} passou, ${testes.length - ok} não. Evidências em ${path.relative(process.cwd(), SAIDA)}/`);
if (idadeMin > 60) console.warn(`AVISO: results.json tem ${idadeMin} min — confirme que é da rodada certa.`);
