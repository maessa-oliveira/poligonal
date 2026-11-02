// Grava uma demonstração em vídeo e converte em GIF/MP4 (docs/demo.gif, docs/demo.mp4).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, rename, mkdir } from 'node:fs/promises';
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
await mkdir(pasta, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, recordVideo: { dir: pasta, size: { width: 1280, height: 760 } } });
const page = await ctx.newPage();
const espera = (ms) => page.waitForTimeout(ms);
await page.goto(`http://localhost:${srv.address().port}/`);
await espera(1800);
// 1. erro grosseiro num ângulo
const ang = page.locator('#tabEntrada tbody tr:nth-child(3) input[data-campo=angulo]');
await ang.click(); await ang.selectText();
await page.keyboard.type('114 03 22', { delay: 90 });
await espera(1800);
await ang.selectText();
await page.keyboard.type('114 01 22', { delay: 90 });
await espera(1500);
// 2. abre um arquivo da estação total
await page.setInputFiles('#arquivo', resolve(raiz, 'exemplos/poligonal-exemplo.M21'));
await espera(600);
await page.fill('#azInicial', '116 03 34');
await page.fill('#e0', '500000,000');
await page.fill('#n0', '8600000,000');
await espera(2200);
// 3. rola até a planilha
await page.locator('#saida').scrollIntoViewIfNeeded();
await espera(2500);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await espera(1500);
await ctx.close(); await browser.close(); srv.close();
const webm = (await readdir(pasta)).filter((f) => f.endsWith('.webm')).map((f) => join(pasta, f)).pop();
const mp4 = resolve(raiz, 'docs/demo.mp4'), gif = resolve(raiz, 'docs/demo.gif');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'fps=10,scale=900:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', gif]);
console.log('ok', mp4, gif);
