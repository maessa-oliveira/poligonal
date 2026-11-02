// Grava uma demonstração em vídeo e converte em GIF/MP4 (docs/demo.gif, docs/demo.mp4).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, rm } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

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
const pasta = resolve(raiz, 'node_modules/.video');
await rm(pasta, { recursive: true, force: true });
await mkdir(pasta, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, recordVideo: { dir: pasta, size: { width: 1280, height: 760 } } });
const page = await ctx.newPage();
const espera = (ms) => page.waitForTimeout(ms);
await page.goto(`http://localhost:${srv.address().port}/`);
const t0 = Date.now();
const ate = async (seg) => { const f = seg * 1000 - (Date.now() - t0); if (f > 0) await page.waitForTimeout(f); };
// roteiro sincronizado com a narração (s): 0 visão geral · 3,2 abre .M21 · 9,4 planilha · 12 relatório/CSV/DXF
await ate(3.2);
await page.setInputFiles('#arquivo', resolve(raiz, 'exemplos/poligonal-exemplo.M21'));
await ate(4.4);
await page.fill('#azInicial', '116 03 34');
await page.fill('#e0', '500000,000');
await page.fill('#n0', '8600000,000');
await ate(9.4);
await page.evaluate(() => document.getElementById('saida').scrollIntoView({ behavior: 'smooth', block: 'end' }));
await ate(12.2);
await page.hover('#btnRelatorio');
await ate(13.6);
await page.hover('#btnCSV');
await ate(14.6);
await page.hover('#btnDXF');
await ate(17.5);
await ctx.close(); await browser.close(); srv.close();
const webm = (await readdir(pasta)).filter((f) => f.endsWith('.webm')).map((f) => join(pasta, f)).pop();
const mp4 = resolve(raiz, 'docs/demo.mp4'), gif = resolve(raiz, 'docs/demo.gif');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'fps=10,scale=900:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', gif]);
console.log('ok', mp4, gif);
