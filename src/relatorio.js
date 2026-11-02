// Desenho (SVG) e relatório (HTML para imprimir ou salvar em PDF) da poligonal calculada.
// Funções puras: recebem o resultado de calcular() e devolvem texto.
import { gms, segundos } from './poligonal.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, c = 3) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }) : '—');

/**
 * SVG da poligonal. `refs` (opcional) = pontos de apoio {re, vante} da enquadrada.
 * As cores vêm de variáveis CSS com valores de reserva, para funcionar dentro e fora da página.
 */
export function desenhoSVG(r, { refs = null, W = 640, H = 480, M = 46 } = {}) {
  const cor = { lado: 'var(--destaque, #1f6f66)', texto: 'var(--texto, #1f2523)', fundo: 'var(--painel, #fff)', erro: 'var(--laranja, #c9771c)', suave: 'var(--suave, #5f6b67)' };
  const pts = r.estacoes.map((e) => ({ e: e.e, n: e.n, nome: e.nome }));
  const apoio = r.tipo === 'enquadrada' && refs ? [refs.re, refs.vante] : [];
  const todos = [...pts, ...apoio];
  const minE = Math.min(...todos.map((p) => p.e)), maxE = Math.max(...todos.map((p) => p.e));
  const minN = Math.min(...todos.map((p) => p.n)), maxN = Math.max(...todos.map((p) => p.n));
  const esc_ = Math.min((W - 2 * M) / (maxE - minE || 1), (H - 2 * M) / (maxN - minN || 1));
  const ox = (W - (maxE - minE) * esc_) / 2, oy = (H - (maxN - minN) * esc_) / 2;
  const X = (e) => (ox + (e - minE) * esc_).toFixed(1), Y = (n) => (H - oy - (n - minN) * esc_).toFixed(1);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Desenho da poligonal">`,
    `<defs><marker id="seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${cor.erro}"/></marker></defs>`];
  if (apoio.length) {
    const [A, D] = apoio, B = pts[0], C = pts[pts.length - 1];
    for (const [p, q] of [[A, B], [C, D]]) out.push(`<line x1="${X(p.e)}" y1="${Y(p.n)}" x2="${X(q.e)}" y2="${Y(q.n)}" stroke="${cor.suave}" stroke-width="1.2" stroke-dasharray="4 4"/>`);
    for (const [p, t] of [[A, 'A'], [D, 'D']]) out.push(`<rect x="${X(p.e) - 4}" y="${Y(p.n) - 4}" width="8" height="8" fill="${cor.texto}"/><text x="${+X(p.e) + 8}" y="${Y(p.n) - 8}" font-size="12" fill="${cor.texto}">${t}</text>`);
  }
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.e)} ${Y(p.n)}`).join(' ') + (r.tipo === 'fechada' ? ' Z' : '');
  out.push(`<path d="${d}" fill="${r.tipo === 'fechada' ? 'rgba(31,111,102,.10)' : 'none'}" stroke="${cor.lado}" stroke-width="2" stroke-linejoin="round"/>`);
  if (r.linear.erro > 0) {
    const ult = r.tipo === 'fechada' ? pts[0] : pts[pts.length - 1];
    const exag = Math.min(4000, 40 / Math.max(r.linear.erro * esc_, 1e-9));
    const x1 = +X(ult.e) + r.linear.eE * esc_ * exag, y1 = +Y(ult.n) - r.linear.eN * esc_ * exag;
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${X(ult.e)}" y2="${Y(ult.n)}" stroke="${cor.erro}" stroke-width="2.2" marker-end="url(#seta)"/>`);
  }
  const cx = pts.reduce((s, p) => s + +X(p.e), 0) / pts.length, cy = pts.reduce((s, p) => s + +Y(p.n), 0) / pts.length;
  const poucos = pts.length <= 40;
  for (const p of pts) {
    const x = +X(p.e), y = +Y(p.n);
    out.push(`<circle cx="${x}" cy="${y}" r="${poucos ? 5 : 3}" fill="${cor.fundo}" stroke="${cor.texto}" stroke-width="1.6"/>`);
    if (poucos) {
      const dx = x - cx, dy = y - cy, k = Math.hypot(dx, dy) || 1;
      const anc = dx < -5 ? 'end' : dx > 5 ? 'start' : 'middle';
      out.push(`<text x="${(x + (dx / k) * 14).toFixed(1)}" y="${(y + (dy / k) * 14 + 4).toFixed(1)}" text-anchor="${anc}" font-size="12" fill="${cor.texto}" paint-order="stroke" stroke="${cor.fundo}" stroke-width="3">${esc(p.nome)}</text>`);
    }
  }
  out.push(`<g transform="translate(${W - 26} 30)"><path d="M0 -14 L6 6 L0 2 L-6 6 Z" fill="${cor.erro}"/><text x="0" y="22" text-anchor="middle" font-size="12" font-weight="700" fill="${cor.suave}">N</text></g>`);
  out.push('</svg>');
  return out.join('\n');
}

/**
 * Relatório completo em HTML (A4, pronto para imprimir ou salvar em PDF).
 * @param r resultado de calcular()
 * @param info { titulo, responsavel, local, data, arquivo, observacoes, refs }
 */
export function relatorioHTML(r, info = {}) {
  const a = r.angular, l = r.linear;
  const data = info.data || new Date().toLocaleDateString('pt-BR');
  const sit = (ok) => `<span class="${ok ? 'ok' : 'ruim'}">${ok ? 'ATENDE' : 'NÃO ATENDE'}</span>`;
  const linhas = r.estacoes.map((e, i) => {
    const lado = r.lados.find((x) => x.de === i);
    return `<tr><td>${esc(e.nome)}</td><td>${gms(e.angulo, 1)}</td><td>${segundos(e.correcaoAng, 1)}</td><td>${gms(e.anguloCorrigido, 1)}</td>
<td>${lado ? gms(lado.az, 1) : '—'}</td><td>${lado ? nf(lado.dist) : '—'}</td><td>${lado ? nf(lado.dE) : '—'}</td><td>${lado ? nf(lado.dN) : '—'}</td>
<td>${lado ? nf(lado.cE * 1000, 1) : '—'}</td><td>${lado ? nf(lado.cN * 1000, 1) : '—'}</td><td>${nf(e.e)}</td><td>${nf(e.n)}</td></tr>`;
  }).join('\n');
  const tipo = r.tipo === 'fechada' ? 'Fechada' : 'Enquadrada';
  const metodo = r.compensacao === 'transito' ? 'Trânsito (proporcional às projeções)' : 'Bowditch (proporcional às distâncias)';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(info.titulo || 'Relatório de poligonal')}</title>
<style>
@page { size: A4; margin: 14mm 12mm; }
body { font: 10.5pt/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2523; margin: 0; }
h1 { font-size: 17pt; margin: 0 0 2mm; } h2 { font-size: 12pt; margin: 6mm 0 2mm; border-bottom: 1px solid #ccc; padding-bottom: 1mm; }
.cab { display: flex; justify-content: space-between; gap: 8mm; border-bottom: 2px solid #1f6f66; padding-bottom: 3mm; }
.cab p { margin: 0; color: #5f6b67; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { border: 1px solid #d5d5cd; padding: 1.2mm 1.6mm; text-align: right; white-space: nowrap; }
th { background: #f0efe9; font-weight: 600; text-align: center; }
td:first-child { text-align: left; font-weight: 600; }
.res td:first-child { font-weight: 400; color: #5f6b67; } .res td { text-align: left; }
.calc { font-size: 8.6pt; }
.ok { color: #1e7f4f; font-weight: 700; } .ruim { color: #b3261e; font-weight: 700; }
.fig { text-align: center; } .fig svg { width: 100%; max-height: 105mm; }
.nota { color: #5f6b67; font-size: 9pt; }
.assin { margin-top: 14mm; display: flex; justify-content: flex-end; } .assin div { border-top: 1px solid #333; padding-top: 1mm; min-width: 70mm; text-align: center; }
</style></head><body>
<div class="cab"><div><h1>${esc(info.titulo || 'Relatório de cálculo de poligonal')}</h1>
<p>${esc(info.local || '')}</p></div>
<div style="text-align:right"><p>Data: ${esc(data)}</p>${info.arquivo ? `<p>Arquivo de campo: ${esc(info.arquivo)}</p>` : ''}</div></div>

<h2>Resumo</h2>
<table class="res">
<tr><td>Tipo de poligonal</td><td>${tipo} · ${r.n} estações · perímetro ${nf(r.perimetro, 3)} m${r.tipo === 'fechada' ? ` · área ${nf(r.area, 2)} m² (${nf(r.area / 10000, 4)} ha)` : ''}</td></tr>
<tr><td>Fechamento angular</td><td>erro ${segundos(a.erro, 1)} · tolerância ±${(a.tolerancia * 3600).toFixed(1)}" (${(a.tolerancia * 3600 / Math.sqrt(r.n)).toFixed(0)}"·√n) · correção ${segundos(a.correcao, 2)} por estação · ${sit(a.ok)}</td></tr>
<tr><td>Fechamento linear</td><td>ΔE ${nf(l.eE, 4)} m · ΔN ${nf(l.eN, 4)} m · erro ${nf(l.erro, 4)} m</td></tr>
<tr><td>Precisão relativa</td><td>1:${Number.isFinite(l.precisao) ? Math.round(l.precisao).toLocaleString('pt-BR') : '∞'} · mínimo exigido 1:${l.precisaoMinima.toLocaleString('pt-BR')} · ${sit(l.ok)}</td></tr>
<tr><td>Compensação linear</td><td>${metodo}${r.fatorEscala !== 1 ? ` · distâncias × K = ${String(r.fatorEscala).replace(".", ",")}` : ''}</td></tr>
</table>

<h2>Croqui</h2>
<div class="fig">${desenhoSVG(r, { refs: info.refs })}</div>
<p class="nota">O vetor laranja indica a direção do erro de fechamento linear antes da compensação (exagerado).</p>

<h2>Planilha de cálculo</h2>
<table class="calc"><thead><tr><th>Est.</th><th>Âng. medido</th><th>Corr.</th><th>Âng. corrigido</th><th>Azimute</th><th>Dist. (m)</th><th>ΔE (m)</th><th>ΔN (m)</th><th>cE (mm)</th><th>cN (mm)</th><th>E (m)</th><th>N (m)</th></tr></thead>
<tbody>${linhas}</tbody></table>
${info.observacoes ? `<h2>Observações</h2><p>${esc(info.observacoes)}</p>` : ''}
<p class="nota">Ângulos horários lidos de ré para vante. Azimute de cada lado: Az(i) = Az(i−1) + α(i) − 180°. Erro angular distribuído igualmente entre as estações.</p>
${info.responsavel ? `<div class="assin"><div>${esc(info.responsavel)}</div></div>` : ''}
</body></html>
`;
}
