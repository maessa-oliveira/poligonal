// Teste de ponta a ponta: abre a página num Chromium real, confere o cálculo do exemplo,
// edita um ângulo, testa a enquadrada e os downloads. Uso: node tests/e2e.mjs [pasta-de-saida]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const raiz = resolve(new URL('..', import.meta.url).pathname);
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = createServer(async (req, res) => {
  try {
    const p = join(raiz, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
    const corpo = await readFile(p);
    res.writeHead(200, { 'content-type': tipos[extname(p)] || 'application/octet-stream' });
    res.end(corpo);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${srv.address().port}/`;
const saida = process.argv[2] || '.';
const browser = await chromium.launch();
const erros = [];
const falha = (m) => { throw new Error(m); };
try {
  for (const [nome, vp] of [['desktop', { width: 1366, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp });
    page.on('pageerror', (e) => erros.push(`${nome}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && erros.push(`${nome}: ${m.text()}`));
    await page.goto(url);
    await page.waitForFunction(() => window.__poligonal?.estacoes?.length === 6);
    const r = await page.evaluate(() => ({ ang: __poligonal.angular.ok, prec: __poligonal.linear.precisao, area: __poligonal.area }));
    const e1 = await page.evaluate(() => __poligonal.estacoes[1].e);
    if (Math.abs(e1 - 500118.406) > 0.01) falha(`${nome}: coordenada de P2 errada (${e1})`);
    if (!r.ang || r.prec < 20000 || Math.abs(r.area - 39579) > 5) falha(`${nome}: exemplo inesperado ${JSON.stringify(r)}`);
    const linhas = await page.locator('#tabSaida tbody tr').count();
    if (linhas !== 6) falha(`${nome}: tabela com ${linhas} linhas`);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (largura > 0) falha(`${nome}: página rola na horizontal (${largura}px)`);
    await page.screenshot({ path: join(saida, `captura-${nome}.png`), fullPage: nome === 'desktop' });
    console.log(nome, 'ok', JSON.stringify(r));
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', (e) => erros.push(`interação: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__poligonal);
  // erro grosseiro num ângulo -> fora da tolerância
  await page.locator('#tabEntrada tbody tr:nth-child(3) input[data-campo=angulo]').fill('114 03 22');
  await page.waitForFunction(() => window.__poligonal && !window.__poligonal.angular.ok);
  if (!(await page.locator('#cAng').getAttribute('class')).includes('ruim')) falha('cartão angular deveria ficar vermelho');
  // ângulo inválido mostra mensagem
  await page.locator('#tabEntrada tbody tr:nth-child(3) input[data-campo=angulo]').fill('114 75 22');
  await page.waitForFunction(() => document.getElementById('erro').textContent.includes('60'));
  await page.setInputFiles('#arquivo', resolve(raiz, 'exemplos/poligonal-exemplo.csv'));
  await page.waitForFunction(() => window.__poligonal?.angular.ok && window.__poligonal.estacoes.length === 6);
  // arquivo .M21 fictício
  await page.setInputFiles('#arquivo', resolve(raiz, 'exemplos/poligonal-exemplo.M21'));
  await page.waitForFunction(() => !document.getElementById('info').hidden);
  const info = await page.locator('#info').textContent();
  if (!/6 estações/.test(info) || !/1 irradiaç/.test(info)) falha('leitura do .M21: ' + info);
  const [rel] = await Promise.all([page.waitForEvent('download'), page.click('#btnRelatorio')]);
  const html = await readFile(await rel.path(), 'utf8');
  if (!html.includes('poligonal-exemplo.M21') || !html.includes('<svg')) falha('relatório inválido');
  if (rel.suggestedFilename() !== 'poligonal-exemplo_relatorio.html') falha('nome do relatório: ' + rel.suggestedFilename());
  await page.click('#btnExemplo');
  await page.waitForFunction(() => window.__poligonal?.angular.ok);
  // downloads
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#btnCSV')]);
  const txtCsv = await readFile(await csv.path(), 'utf8');
  if (!txtCsv.includes('P1;117°50') || txtCsv.trim().split('\n').length !== 7) falha('CSV inválido');
  const [dxf] = await Promise.all([page.waitForEvent('download'), page.click('#btnDXF')]);
  if (!(await readFile(await dxf.path(), 'utf8')).trim().endsWith('EOF')) falha('DXF inválido');
  // poligonal enquadrada
  await page.selectOption('#tipo', 'enquadrada');
  await page.fill('#refA', '1000 ; 900'); await page.fill('#refB', '1000 ; 1000');
  await page.fill('#refC', '1250 ; 1100'); await page.fill('#refD', '1350 ; 1100');
  const est = [['B', '233 07 52', '100,004'], ['X1', '229 23 55', '92,195'], ['X2', '130 36 05', '99,998'], ['C', '216 52 12', '']];
  await page.evaluate(() => document.querySelector('#tabEntrada tbody').replaceChildren());
  for (const [n, a, d] of est) {
    await page.click('#btnLinha');
    const tr = page.locator('#tabEntrada tbody tr').last();
    await tr.locator('[data-campo=nome]').fill(n); await tr.locator('[data-campo=angulo]').fill(a); await tr.locator('[data-campo=distancia]').fill(d);
  }
  await page.waitForFunction(() => window.__poligonal?.tipo === 'enquadrada' && window.__poligonal.estacoes.length === 4);
  const enq = await page.evaluate(() => ({ ang: __poligonal.angular.erro * 3600, lin: __poligonal.linear.erro }));
  if (Math.abs(enq.ang - 4) > 0.5 || enq.lin > 0.02) falha(`enquadrada inesperada ${JSON.stringify(enq)}`);
  await page.screenshot({ path: join(saida, 'captura-enquadrada.png') });
  console.log('interação ok', JSON.stringify(enq));
} finally {
  await browser.close();
  srv.close();
}
if (erros.length) { console.error('ERROS NO CONSOLE:\n' + erros.join('\n')); process.exit(1); }
