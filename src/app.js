// Interface da calculadora. Os cálculos estão em ./poligonal.js.
import { calcular, gms, segundos, paraCSV, paraDXF, lerTabela, poligonalDeM21, EXEMPLO } from './poligonal.js';
import { desenhoSVG, relatorioHTML } from './relatorio.js';

const $ = (id) => document.getElementById(id);
const nf = (v, c = 3) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
// aceita 8.600.000,123 / 8600000,123 / 8600000.123
const num = (s) => {
  let t = String(s ?? '').trim().replace(/\s/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  return t === '' ? NaN : Number(t);
};
const corpo = $('tabEntrada').querySelector('tbody');
let ultimo = null;

// ---------- tabela de entrada ----------
function novaLinha(d = {}) {
  const tr = document.createElement('tr');
  for (const [campo, ph, modo] of [['nome', 'P1', 'text'], ['angulo', '117 50 46', 'text'], ['distancia', '131,804', 'decimal']]) {
    const td = document.createElement('td');
    const inp = document.createElement('input');
    inp.dataset.campo = campo; inp.placeholder = ph; inp.inputMode = modo; inp.autocomplete = 'off';
    inp.value = d[campo] ?? '';
    inp.setAttribute('aria-label', { nome: 'Estação', angulo: 'Ângulo horário', distancia: 'Distância' }[campo]);
    td.append(inp); tr.append(td);
  }
  const td = document.createElement('td');
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'x'; b.textContent = '✕'; b.title = 'Remover estação';
  b.addEventListener('click', () => { tr.remove(); recalcular(); });
  td.append(b); tr.append(td);
  corpo.append(tr);
  return tr;
}
function lerLinhas() {
  return [...corpo.querySelectorAll('tr')].map((tr) => {
    const o = {};
    tr.querySelectorAll('input').forEach((i) => { o[i.dataset.campo] = i.value.trim(); });
    return o;
  }).filter((o) => o.nome || o.angulo || o.distancia);
}
function preencher(dados) {
  $('tipo').value = dados.tipo || 'fechada';
  $('azInicial').value = dados.azInicial ?? '';
  $('e0').value = dados.inicio ? nf(dados.inicio.e) : '';
  $('n0').value = dados.inicio ? nf(dados.inicio.n) : '';
  for (const [k, id] of [['re', 'refA'], ['partida', 'refB'], ['chegada', 'refC'], ['vante', 'refD']]) {
    const p = dados.refs?.[k];
    $(id).value = p ? `${nf(p.e)} ; ${nf(p.n)}` : '';
  }
  corpo.replaceChildren();
  dados.estacoes.forEach((s) => novaLinha({ ...s, distancia: String(s.distancia).replace('.', ',') }));
  trocarTipo();
}
function lerPonto(id, rotulo) {
  const partes = $(id).value.split(/[;\t]|\s{2,}/).map((x) => x.trim()).filter(Boolean);
  const [e, n] = partes.map(num);
  if (partes.length !== 2 || Number.isNaN(e) || Number.isNaN(n)) throw new Error(`Informe E ; N do ponto ${rotulo}.`);
  return { e, n };
}

// ---------- cálculo ----------
function entrada() {
  const tipo = $('tipo').value;
  const base = {
    tipo,
    estacoes: lerLinhas(),
    tolAngular: num($('tolAng').value) || 20,
    precisaoMinima: num($('precMin').value) || 5000,
    compensacao: $('metodo').value,
    fatorEscala: num($('fatorK').value) || 1,
  };
  if (tipo === 'fechada') {
    if (!$('azInicial').value.trim()) throw new Error('Informe o azimute da linha P1→P2.');
    const e = num($('e0').value), n = num($('n0').value);
    return { ...base, azInicial: $('azInicial').value, inicio: { e: Number.isNaN(e) ? 0 : e, n: Number.isNaN(n) ? 0 : n } };
  }
  return { ...base, refs: { re: lerPonto('refA', 'A'), partida: lerPonto('refB', 'B'), chegada: lerPonto('refC', 'C'), vante: lerPonto('refD', 'D') } };
}

function recalcular() {
  $('erro').textContent = '';
  try {
    const dados = entrada();
    if (dados.estacoes.length < 3) throw new Error('Informe pelo menos 3 estações.');
    ultimo = { r: calcular(dados), dados };
    mostrar(ultimo.r, dados);
  } catch (e) {
    ultimo = null;
    $('erro').textContent = e.message.charAt(0).toUpperCase() + e.message.slice(1);
    limpar();
  }
  window.__poligonal = ultimo?.r ?? null;
}

function cartao(id, ok) {
  $(id).classList.toggle('ok', ok === true);
  $(id).classList.toggle('ruim', ok === false);
}
function limpar() {
  for (const k of ['Ang', 'Lin', 'Prec', 'Area']) { $('v' + k).textContent = '—'; $('s' + k).textContent = '—'; }
  ['cAng', 'cLin', 'cPrec', 'cArea'].forEach((c) => cartao(c, null));
  $('tabSaida').querySelector('tbody').replaceChildren();
  $('desenho').replaceChildren();
}

function mostrar(r) {
  const a = r.angular, l = r.linear;
  $('vAng').textContent = segundos(a.erro, 1);
  $('sAng').textContent = `${a.ok ? 'dentro' : 'fora'} da tolerância (±${(a.tolerancia * 3600).toFixed(1)}")`;
  cartao('cAng', a.ok);
  $('vLin').textContent = `${nf(l.erro * 1000, 1)} mm`;
  $('sLin').textContent = `ΔE ${nf(l.eE * 1000, 1)} · ΔN ${nf(l.eN * 1000, 1)} mm`;
  cartao('cLin', l.ok);
  $('vPrec').textContent = Number.isFinite(l.precisao) ? `1:${Math.round(l.precisao).toLocaleString('pt-BR')}` : 'exata';
  $('sPrec').textContent = `${l.ok ? 'atende' : 'não atende'} o mínimo de 1:${l.precisaoMinima.toLocaleString('pt-BR')}`;
  cartao('cPrec', l.ok);
  if (r.tipo === 'fechada') {
    $('rArea').textContent = 'Área';
    $('vArea').textContent = `${nf(r.area, 2)} m²`;
    $('sArea').textContent = `${nf(r.area / 10000, 4)} ha · perímetro ${nf(r.perimetro, 2)} m`;
  } else {
    $('rArea').textContent = 'Extensão';
    $('vArea').textContent = `${nf(r.perimetro, 2)} m`;
    $('sArea').textContent = `${r.lados.length} lados`;
  }
  cartao('cArea', null);

  const tb = $('tabSaida').querySelector('tbody');
  tb.replaceChildren();
  r.estacoes.forEach((e, i) => {
    const lado = r.lados.find((x) => x.de === i);
    const tr = document.createElement('tr');
    const cel = (t, cls) => { const td = document.createElement('td'); td.textContent = t; if (cls) td.className = cls; tr.append(td); };
    cel(e.nome);
    cel(gms(e.angulo, 1)); cel(segundos(e.correcaoAng, 1)); cel(gms(e.anguloCorrigido, 1));
    cel(lado ? gms(lado.az, 1) : '—');
    cel(lado ? nf(lado.dist) : '—', 'num');
    cel(lado ? nf(lado.dE) : '—', 'num'); cel(lado ? nf(lado.dN) : '—', 'num');
    cel(lado ? nf(lado.cE * 1000, 1) : '—', 'num'); cel(lado ? nf(lado.cN * 1000, 1) : '—', 'num');
    cel(nf(e.e), 'num'); cel(nf(e.n), 'num');
    tb.append(tr);
  });
  desenhar(r);
}

// ---------- desenho ----------
function desenhar(r) {
  $('desenho').innerHTML = desenhoSVG(r, { refs: ultimo?.dados?.refs });
}

// ---------- exportação ----------
function baixar(nome, texto, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nome; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('btnCSV').addEventListener('click', () => ultimo && baixar('poligonal.csv', '﻿' + paraCSV(ultimo.r), 'text/csv;charset=utf-8'));
$('btnDXF').addEventListener('click', () => ultimo && baixar('poligonal.dxf', paraDXF(ultimo.r), 'application/dxf'));
$('btnImprimir').addEventListener('click', () => window.print());
let arquivoAtual = '';
$('btnRelatorio').addEventListener('click', () => {
  if (!ultimo) return;
  const nome = arquivoAtual ? arquivoAtual.replace(/\.[^.]+$/, '') : 'poligonal';
  baixar(`${nome}_relatorio.html`, relatorioHTML(ultimo.r, { arquivo: arquivoAtual, refs: ultimo.dados.refs }), 'text/html;charset=utf-8');
});

// ---------- eventos ----------
function trocarTipo() {
  const f = $('tipo').value === 'fechada';
  $('cxFechada').hidden = !f;
  $('cxEnquadrada').hidden = f;
}
$('tipo').addEventListener('change', () => { trocarTipo(); recalcular(); });
document.addEventListener('input', (ev) => { if (ev.target.closest('#entrada') && ev.target.id !== 'colar') recalcular(); });
$('btnLinha').addEventListener('click', () => { novaLinha({ nome: `P${corpo.children.length + 1}` }).querySelector('[data-campo=angulo]').focus(); });
$('btnColar').addEventListener('click', () => { $('colar').hidden = !$('colar').hidden; if (!$('colar').hidden) $('colar').focus(); });
$('colar').addEventListener('paste', () => setTimeout(() => {
  const est = lerTabela($('colar').value);
  if (!est.length) { $('erro').textContent = 'Não encontrei linhas no formato Estação ; Ângulo ; Distância.'; return; }
  corpo.replaceChildren();
  est.forEach(novaLinha);
  $('colar').value = ''; $('colar').hidden = true;
  recalcular();
}, 0));
$('arquivo').addEventListener('change', async () => {
  const f = $('arquivo').files[0];
  if (!f) return;
  const buf = await f.arrayBuffer();
  let txt = new TextDecoder('utf-8').decode(buf);
  if (txt.includes('\ufffd')) txt = new TextDecoder('windows-1252').decode(buf); // arquivos salvos pelo Excel
  txt = txt.replace(/^\ufeff/, '');
  $('arquivo').value = '';
  $('info').hidden = true;
  let est;
  if (/\.m21$/i.test(f.name) || /^_'/m.test(txt)) {
    try {
      const p = poligonalDeM21(txt);
      est = p.estacoes.map((e) => ({ nome: e.nome, angulo: gms(e.angulo, 1), distancia: e.distancia.replace('.', ',') }));
      $('tipo').value = p.fechada ? 'fechada' : 'enquadrada';
      trocarTipo();
      const dif = Math.max(0, ...p.estacoes.map((e) => e.difIdaVolta ?? 0));
      $('info').textContent = `${f.name}: ${p.estacoes.length} estações (${p.fechada ? 'poligonal fechada' : 'sequência aberta'}), ângulos ré→vante e distâncias horizontais (média ida/volta; maior diferença ${(dif * 1000).toFixed(1)} mm)`
        + (p.irradiacoes ? `. ${p.irradiacoes} irradiações ignoradas.` : '.') + ' Informe o azimute e as coordenadas de partida.';
      $('info').hidden = false;
    } catch (e) {
      $('erro').textContent = `${f.name}: ${e.message}.`;
      return;
    }
  } else {
    est = lerTabela(txt);
  }
  if (!est.length) { $('erro').textContent = `Não encontrei estações em ${f.name}. Use uma linha por estação: Estação ; Ângulo ; Distância.`; return; }
  arquivoAtual = f.name;
  corpo.replaceChildren();
  est.forEach(novaLinha);
  recalcular();
});
$('btnExemplo').addEventListener('click', () => { arquivoAtual = ''; $('info').hidden = true; preencher(EXEMPLO); recalcular(); });

preencher(EXEMPLO);
recalcular();
