// Cálculo de poligonal topográfica (fechada ou enquadrada), sem dependência de navegador.
//
// Convenções:
//  - ângulos horizontais horários, lidos de ré para vante (como na estação total);
//  - azimute de uma linha a partir do anterior: Az(i) = Az(i-1) + α(i) − 180°;
//  - coordenadas planas (E, N) em metros; distâncias horizontais já reduzidas.

const RAD = Math.PI / 180;
const SEG = 1 / 3600;

/** Normaliza um ângulo para [0, 360). */
export function norm360(g) {
  const r = g % 360;
  return r < 0 ? r + 360 : r;
}

/** Normaliza uma diferença angular para (−180, 180]. */
export function norm180(g) {
  const r = norm360(g);
  return r > 180 ? r - 360 : r;
}

/**
 * Lê um ângulo em graus. Aceita:
 *   "123°45'30\""  "123 45 30"  "123-45-30"  "123:45:30.5"  "123,7584"  "123.7584"
 *   "123.4530" com `formato: 'gms-ponto'` (padrão das cadernetas: GGG.MMSS).
 */
export function lerAngulo(txt, { formato = 'auto' } = {}) {
  if (typeof txt === 'number') return txt;
  const s = String(txt ?? '').trim();
  if (!s) throw new Error('ângulo vazio');
  const neg = /^-/.test(s);
  const corpo = s.replace(/^[-+]/, '');
  const partes = corpo.split(/[°º'’"”\s:\-dDmMsS]+/).filter(Boolean).map((p) => p.replace(',', '.'));
  let g;
  if (partes.length >= 2) {
    const [gg, mm = '0', ss = '0'] = partes;
    const [G, M, S] = [Number(gg), Number(mm), Number(ss)];
    if ([G, M, S].some(Number.isNaN)) throw new Error(`ângulo inválido: "${txt}"`);
    if (M >= 60 || S >= 60) throw new Error(`minutos ou segundos ≥ 60 em "${txt}"`);
    g = G + M / 60 + S / 3600;
  } else {
    const v = partes[0];
    if (formato === 'gms-ponto') {
      const [ig, frac = ''] = v.split('.');
      const f = (frac + '0000').slice(0, 4);
      const resto = frac.length > 4 ? Number('0.' + frac.slice(4)) : 0;
      const M = Number(f.slice(0, 2)), S = Number(f.slice(2, 4)) + resto;
      if (M >= 60 || S >= 60) throw new Error(`minutos ou segundos ≥ 60 em "${txt}"`);
      g = Number(ig) + M / 60 + S / 3600;
    } else {
      g = Number(v);
    }
    if (Number.isNaN(g)) throw new Error(`ângulo inválido: "${txt}"`);
  }
  return neg ? -g : g;
}

/** Formata graus como 123°45'30.0". */
export function gms(g, casas = 1) {
  const neg = g < 0;
  let a = Math.abs(g);
  let G = Math.floor(a);
  let M = Math.floor((a - G) * 60);
  let S = (a - G - M / 60) * 3600;
  if (Number(S.toFixed(casas)) >= 60) { S = 0; M += 1; }
  if (M >= 60) { M = 0; G += 1; }
  return `${neg ? '-' : ''}${G}°${String(M).padStart(2, '0')}'${S.toFixed(casas).padStart(casas ? casas + 3 : 2, '0')}"`;
}

/** Formata segundos de arco com sinal: +12.3". */
export function segundos(g, casas = 1) {
  const s = g * 3600;
  return `${s >= 0 ? '+' : '−'}${Math.abs(s).toFixed(casas)}"`;
}

/** Azimute (graus) e distância entre dois pontos {e, n}. */
export function inverso(a, b) {
  const de = b.e - a.e, dn = b.n - a.n;
  return { az: norm360(Math.atan2(de, dn) / RAD), dist: Math.hypot(de, dn) };
}

/** Área (m²) e perímetro de um polígono fechado de vértices {e, n} (fórmula de Gauss). */
export function areaPerimetro(pts) {
  let a = 0, p = 0;
  for (let i = 0; i < pts.length; i++) {
    const u = pts[i], v = pts[(i + 1) % pts.length];
    a += u.e * v.n - v.e * u.n;
    p += Math.hypot(v.e - u.e, v.n - u.n);
  }
  return { area: Math.abs(a) / 2, perimetro: p };
}

/**
 * Calcula a poligonal.
 *
 * Poligonal FECHADA (`tipo: 'fechada'`): vértices P1..Pn, o último liga de volta ao primeiro.
 *   estacoes[i] = { nome, angulo, distancia }  — ângulo medido no vértice i (ré = vértice anterior,
 *   vante = próximo) e distância do vértice i ao i+1 (a do último vai até P1).
 *   `azInicial` = azimute da linha P1→P2; `inicio` = {e, n} de P1.
 *
 * Poligonal ENQUADRADA (`tipo: 'enquadrada'`): sai de um par conhecido (ré A, partida B) e chega
 *   noutro (chegada C, vante D). estacoes[0] é B, a última é C; o ângulo de cada estação é lido
 *   de ré para vante e `distancia` é até a próxima estação (a de C não é usada).
 *   `refs` = { re: A, partida: B, chegada: C, vante: D } com {e, n}.
 *
 * Opções: `tolAngular` em segundos por √n (padrão 20"), `precisaoMinima` (padrão 5000, ou seja 1:5000),
 *   `compensacao`: 'bowditch' (proporcional às distâncias, padrão) ou 'transito' (proporcional a |ΔE|, |ΔN|),
 *   `fatorEscala`: K aplicado às distâncias horizontais (ex.: fator de escala UTM combinado), padrão 1.
 */
export function calcular(entrada) {
  const {
    tipo = 'fechada', estacoes, azInicial, inicio, refs,
    tolAngular = 20, precisaoMinima = 5000, compensacao = 'bowditch', fatorEscala = 1,
  } = entrada;
  const K = Number(fatorEscala) || 1;
  if (!Array.isArray(estacoes) || estacoes.length < 3) throw new Error('informe pelo menos 3 estações');
  const est = estacoes.map((s, i) => {
    const angulo = lerAngulo(s.angulo);
    const distancia = Number(String(s.distancia ?? '').replace(',', '.')) * K;
    return { nome: String(s.nome || `P${i + 1}`), angulo, distancia };
  });
  const n = est.length;
  const nLados = tipo === 'fechada' ? n : n - 1;
  for (let i = 0; i < nLados; i++) {
    if (!(est[i].distancia > 0)) throw new Error(`distância inválida em ${est[i].nome}`);
  }

  // ---- 1. Fechamento angular ----
  let az0, erroAngular, esperado, azChegadaConhecido;
  const soma = est.reduce((s, e) => s + e.angulo, 0);
  if (tipo === 'fechada') {
    az0 = lerAngulo(azInicial);
    // Volta completa: o azimute final tem de repetir o inicial, ou seja Σα ≡ n·180° (mód. 360°).
    // Vale para ângulos internos ((n−2)·180°), externos ((n+2)·180°) e para poligonais que se cruzam.
    erroAngular = norm180(soma - n * 180);
    esperado = soma - erroAngular;
  } else if (tipo === 'enquadrada') {
    if (!refs?.re || !refs?.partida || !refs?.chegada || !refs?.vante) throw new Error('informe os 4 pontos de apoio');
    const azRe = inverso(refs.re, refs.partida).az; // A→B
    azChegadaConhecido = inverso(refs.chegada, refs.vante).az; // C→D
    // Az(C→D) calculado = Az(A→B) + Σα − n·180
    const azCalc = norm360(azRe + soma - n * 180);
    erroAngular = norm180(azCalc - azChegadaConhecido);
    esperado = soma - erroAngular;
    az0 = azRe;
  } else {
    throw new Error(`tipo de poligonal desconhecido: ${tipo}`);
  }
  const toleranciaAng = (tolAngular * Math.sqrt(n)) * SEG;
  const correcaoAng = -erroAngular / n;
  est.forEach((e) => { e.correcaoAng = correcaoAng; e.anguloCorrigido = e.angulo + correcaoAng; });

  // ---- 2. Azimutes ----
  // fechada: o lado P1→P2 tem azimute az0; o ângulo de P1 só entra no fechamento.
  // enquadrada: o lado B→próxima = Az(A→B) + α(B) − 180.
  const lados = [];
  if (tipo === 'fechada') {
    let az = norm360(az0);
    for (let i = 0; i < n; i++) {
      if (i > 0) az = norm360(az + est[i].anguloCorrigido - 180);
      lados.push({ de: i, para: (i + 1) % n, az, dist: est[i].distancia });
    }
  } else {
    let az = az0;
    for (let i = 0; i < n - 1; i++) {
      az = norm360(az + est[i].anguloCorrigido - 180);
      lados.push({ de: i, para: i + 1, az, dist: est[i].distancia });
    }
  }

  // ---- 3. Projeções e fechamento linear ----
  for (const l of lados) {
    l.dE = l.dist * Math.sin(l.az * RAD);
    l.dN = l.dist * Math.cos(l.az * RAD);
  }
  const perimetro = lados.reduce((s, l) => s + l.dist, 0);
  let eE = lados.reduce((s, l) => s + l.dE, 0);
  let eN = lados.reduce((s, l) => s + l.dN, 0);
  const p0 = tipo === 'fechada' ? { e: Number(inicio?.e ?? 0), n: Number(inicio?.n ?? 0) } : { ...refs.partida };
  if (tipo === 'enquadrada') {
    eE -= refs.chegada.e - refs.partida.e;
    eN -= refs.chegada.n - refs.partida.n;
  }
  const erroLinear = Math.hypot(eE, eN);
  const precisao = erroLinear > 0 ? perimetro / erroLinear : Infinity;

  // ---- 4. Compensação ----
  const somaAbsE = lados.reduce((s, l) => s + Math.abs(l.dE), 0) || 1;
  const somaAbsN = lados.reduce((s, l) => s + Math.abs(l.dN), 0) || 1;
  for (const l of lados) {
    if (compensacao === 'transito') {
      l.cE = -eE * Math.abs(l.dE) / somaAbsE;
      l.cN = -eN * Math.abs(l.dN) / somaAbsN;
    } else {
      l.cE = -eE * l.dist / perimetro;
      l.cN = -eN * l.dist / perimetro;
    }
    l.dEc = l.dE + l.cE;
    l.dNc = l.dN + l.cN;
  }

  // ---- 5. Coordenadas ----
  const coords = [{ e: p0.e, n: p0.n }];
  for (const l of lados.slice(0, tipo === 'fechada' ? n - 1 : n - 1)) {
    const a = coords[coords.length - 1];
    coords.push({ e: a.e + l.dEc, n: a.n + l.dNc });
  }
  est.forEach((e, i) => { e.e = coords[i].e; e.n = coords[i].n; });

  const resultado = {
    tipo, n, estacoes: est, lados, perimetro,
    angular: {
      soma, esperado, erro: erroAngular, tolerancia: toleranciaAng, correcao: correcaoAng,
      ok: Math.abs(erroAngular) <= toleranciaAng + 1e-12,
    },
    linear: {
      eE, eN, erro: erroLinear, precisao, precisaoMinima,
      ok: precisao >= precisaoMinima,
    },
    compensacao, fatorEscala: K,
  };
  if (tipo === 'fechada') {
    resultado.area = areaPerimetro(coords).area;
  } else {
    resultado.azChegadaConhecido = azChegadaConhecido;
  }
  return resultado;
}

/** Converte o resultado em CSV (separador ;, vírgula decimal) para planilhas brasileiras. */
export function paraCSV(r) {
  const f = (v, c = 3) => (Number.isFinite(v) ? v.toFixed(c).replace('.', ',') : '');
  const linhas = ['Estacao;Angulo medido;Correcao (");Angulo corrigido;Azimute (vante);Distancia (m);dE (m);dN (m);Corr. E (m);Corr. N (m);E (m);N (m)'];
  r.estacoes.forEach((e, i) => {
    const l = r.lados.find((x) => x.de === i);
    linhas.push([
      e.nome, gms(e.angulo), f(e.correcaoAng * 3600, 2), gms(e.anguloCorrigido),
      l ? gms(l.az) : '', l ? f(l.dist) : '', l ? f(l.dE) : '', l ? f(l.dN) : '',
      l ? f(l.cE, 4) : '', l ? f(l.cN, 4) : '', f(e.e), f(e.n),
    ].join(';'));
  });
  return linhas.join('\r\n') + '\r\n';
}

/** DXF R12 com a poligonal (POLYLINE), vértices (POINT) e rótulos (TEXT). */
export function paraDXF(r, { altura = 1.5 } = {}) {
  const out = ['0', 'SECTION', '2', 'ENTITIES'];
  const fechada = r.tipo === 'fechada';
  out.push('0', 'POLYLINE', '8', 'POLIGONAL', '66', '1', '70', fechada ? '1' : '0');
  for (const e of r.estacoes) out.push('0', 'VERTEX', '8', 'POLIGONAL', '10', e.e.toFixed(4), '20', e.n.toFixed(4), '30', '0.0');
  out.push('0', 'SEQEND');
  for (const e of r.estacoes) {
    out.push('0', 'POINT', '8', 'VERTICES', '10', e.e.toFixed(4), '20', e.n.toFixed(4), '30', '0.0');
    out.push('0', 'TEXT', '8', 'ROTULOS', '10', (e.e + altura).toFixed(4), '20', (e.n + altura).toFixed(4), '30', '0.0', '40', String(altura), '1', e.nome);
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\r\n') + '\r\n';
}

/** Lê linhas "Nome;ângulo;distância" coladas de uma planilha ou caderneta. */
export function lerTabela(texto) {
  const linhas = String(texto).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const est = [];
  for (const l of linhas) {
    const c = l.split(/\t|;/).map((x) => x.trim());
    if (c.length < 2) continue;
    if (!/\d/.test(c[1])) continue; // cabeçalho
    est.push({ nome: c[0], angulo: c[1], distancia: c[2] ?? '' });
  }
  return est;
}


// ---------- arquivo de estação total (.M21) ----------
// Linhas do tipo:
//   _'F2_(E_)1.569                                   estação ocupada F2, altura do instrumento
//   _+F1_ ?+00064862m0895612+0000000d+00064862t60... _*R_,1.600   ré F1
//   _+F3_ ?+00070550m0900629+0052110d+00070550t60... _*V_,1.600   vante F3
// ?  = distância inclinada (mm) · m = ângulo zenital GGGMMSS · sinal + GGGMMSS = ângulo horizontal
// d  = distância horizontal (mm). Códigos *R (ré) e *V (vante) definem a poligonal; os demais são irradiações.
const RE_M21 = /^_\+(.+?)_ \?([+-]\d+)m(\d{7})([+-]\d{7})d([+-]\d+)\S*?_\*([^_]*)_/;
const gmsCompacto = (t) => {
  const v = t.replace(/^[+-]/, '').padStart(7, '0');
  return Number(v.slice(0, 3)) + Number(v.slice(3, 5)) / 60 + Number(v.slice(5, 7)) / 3600;
};
const media = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Lê as leituras de um arquivo .M21: lista de estações ocupadas com suas visadas. */
export function lerM21(texto) {
  const ocup = [];
  let atual = null;
  for (const bruta of String(texto).split(/\r?\n/)) {
    const l = bruta.trim();
    const est = l.match(/^_'(.+?)_\(E_\)\s*([-\d.,]*)/);
    if (est) { atual = { nome: est[1], hi: Number(est[2].replace(',', '.')) || 0, re: [], vante: [], irradiacoes: 0 }; ocup.push(atual); continue; }
    const m = l.match(RE_M21);
    if (!m || !atual) continue;
    let ponto = m[1];
    if (ponto.includes('`')) ponto = ponto.split('`').pop(); // ré renomeada: "B`A" = ré no ponto A
    const vis = { ponto, hz: gmsCompacto(m[4]), zen: gmsCompacto(m[3]), di: Number(m[2]) / 1000, dh: Number(m[5]) / 1000 };
    const cod = m[6].toUpperCase();
    if (cod === 'R') atual.re.push(vis);
    else if (cod === 'V') atual.vante.push(vis);
    else atual.irradiacoes++;
  }
  return ocup;
}

/**
 * Monta a poligonal a partir das leituras do .M21: segue de vante em vante a partir da primeira
 * estação. Ângulo horário = Hz(vante) − Hz(ré); distância = média da ida (vante) e da volta (ré
 * medida da estação seguinte), quando houver. Leituras repetidas são promediadas.
 */
export function poligonalDeM21(texto) {
  const ocup = lerM21(texto).filter((o) => o.re.length && o.vante.length);
  if (!ocup.length) throw new Error('o arquivo não tem estações com ré (*R) e vante (*V)');
  const porNome = new Map();
  for (const o of ocup) if (!porNome.has(o.nome)) porNome.set(o.nome, o);
  const angMedio = (hs) => {
    // média circular simples (leituras próximas)
    const ref = hs[0];
    return norm360(ref + media(hs.map((h) => norm180(h - ref))));
  };
  const seq = [];
  const vistos = new Set();
  let o = ocup[0];
  while (o && !vistos.has(o.nome)) {
    vistos.add(o.nome);
    seq.push(o);
    o = porNome.get(o.vante[0].ponto);
  }
  const fechada = !!o && o.nome === seq[0].nome && seq.length >= 3;
  const estacoes = seq.map((oc, i) => {
    const vNome = oc.vante[0].ponto;
    const hzV = angMedio(oc.vante.filter((v) => v.ponto === vNome).map((v) => v.hz));
    const hzR = angMedio(oc.re.map((v) => v.hz));
    const prox = seq[i + 1] ?? (fechada ? seq[0] : null);
    const ida = oc.vante.filter((v) => v.ponto === vNome).map((v) => v.dh);
    const volta = prox && prox.nome === vNome ? prox.re.filter((v) => v.ponto === oc.nome).map((v) => v.dh) : [];
    return {
      nome: oc.nome,
      angulo: norm360(hzV - hzR),
      distancia: media([...ida, ...volta]).toFixed(4),
      re: oc.re[0].ponto, vante: vNome,
      difIdaVolta: volta.length ? Math.abs(media(ida) - media(volta)) : null,
    };
  });
  return { fechada, estacoes, irradiacoes: ocup.reduce((s, x) => s + x.irradiacoes, 0) };
}

/**
 * Poligonal fechada de exemplo (dados fictícios): 6 vértices de um terreno,
 * medidos com pequenos erros de ângulo e distância.
 */
export const EXEMPLO = {
  tipo: 'fechada',
  azInicial: '116°03\'34"',
  inicio: { e: 500000.000, n: 8600000.000 },
  estacoes: [
    { nome: 'P1', angulo: '117°50\'46"', distancia: '131.804' },
    { nome: 'P2', angulo: '119°54\'45"', distancia: '136.705' },
    { nome: 'P3', angulo: '114°01\'22"', distancia: '123.174' },
    { nome: 'P4', angulo: '120°07\'50"', distancia: '120.032' },
    { nome: 'P5', angulo: '121°53\'38"', distancia: '127.885' },
    { nome: 'P6', angulo: '126°11\'37"', distancia: '102.552' },
  ],
};
