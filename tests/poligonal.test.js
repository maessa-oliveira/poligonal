import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lerAngulo, gms, norm360, norm180, inverso, areaPerimetro, calcular, paraCSV, paraDXF, lerTabela, EXEMPLO,
} from '../src/poligonal.js';

const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≠ ${b} (tol ${tol})`);

// Gera uma poligonal fechada perfeita a partir de coordenadas "verdadeiras".
function poligonalDe(P, { ruidoAng = () => 0, ruidoDist = () => 0 } = {}) {
  const n = P.length;
  const estacoes = P.map((s, i) => {
    const re = P[(i - 1 + n) % n], v = P[(i + 1) % n];
    const ang = norm360(inverso(s, v).az - inverso(s, re).az) + ruidoAng(i) / 3600;
    return { nome: `V${i + 1}`, angulo: ang, distancia: inverso(s, v).dist + ruidoDist(i) };
  });
  return { tipo: 'fechada', azInicial: inverso(P[0], P[1]).az, inicio: P[0], estacoes };
}
const QUADRADO = [{ e: 0, n: 0 }, { e: 100, n: 0 }, { e: 100, n: 100 }, { e: 0, n: 100 }];

test('lerAngulo aceita os formatos de caderneta', () => {
  perto(lerAngulo('123°45\'30"'), 123.758333333, 1e-9);
  perto(lerAngulo('123 45 30'), 123.758333333, 1e-9);
  perto(lerAngulo('123-45-30'), 123.758333333, 1e-9);
  perto(lerAngulo('123:45:30,5'), 123 + 45 / 60 + 30.5 / 3600, 1e-9);
  perto(lerAngulo('123,5'), 123.5, 1e-12);
  perto(lerAngulo('123.4530', { formato: 'gms-ponto' }), 123.758333333, 1e-9);
  perto(lerAngulo('-0 30 00'), -0.5, 1e-12);
  assert.throws(() => lerAngulo('10 75 00'), /≥ 60/);
  assert.throws(() => lerAngulo(''), /vazio/);
  assert.throws(() => lerAngulo('abc'), /inválido/);
});

test('gms formata e arredonda sem gerar 60"', () => {
  assert.equal(gms(123.758333333, 0), '123°45\'30"');
  assert.equal(gms(10.999999999, 1), '11°00\'00.0"');
  assert.equal(gms(0.5, 1), '0°30\'00.0"');
});

test('normalização de ângulos', () => {
  assert.equal(norm360(-90), 270);
  assert.equal(norm360(725), 5);
  assert.equal(norm180(350), -10);
  assert.equal(norm180(180), 180);
});

test('inverso e área de um quadrado', () => {
  const r = inverso({ e: 0, n: 0 }, { e: 100, n: 100 });
  perto(r.az, 45, 1e-12); perto(r.dist, Math.SQRT2 * 100, 1e-9);
  perto(inverso({ e: 0, n: 0 }, { e: -1, n: 0 }).az, 270, 1e-12);
  const a = areaPerimetro(QUADRADO);
  perto(a.area, 10000, 1e-9); perto(a.perimetro, 400, 1e-9);
});

test('poligonal fechada sem erro devolve as coordenadas verdadeiras', () => {
  const P = [{ e: 500000, n: 8600000 }, { e: 500118.4, n: 8599942.1 }, { e: 500231.7, n: 8600018.6 },
    { e: 500210.3, n: 8600139.9 }, { e: 500097.6, n: 8600181.2 }, { e: 499996.8, n: 8600102.5 }];
  const r = calcular(poligonalDe(P));
  perto(r.angular.erro * 3600, 0, 1e-6, 'erro angular');
  perto(r.linear.erro, 0, 1e-6, 'erro linear');
  assert.equal(r.angular.esperado, 720);
  r.estacoes.forEach((e, i) => { perto(e.e, P[i].e, 1e-6); perto(e.n, P[i].n, 1e-6); });
  perto(r.area, areaPerimetro(P).area, 1e-4);
});

test('sentido horário usa ângulos externos (n+2)·180', () => {
  const P = [...QUADRADO].reverse();
  const r = calcular(poligonalDe(P));
  assert.equal(r.angular.esperado, (4 + 2) * 180);
  perto(r.linear.erro, 0, 1e-9);
});

test('erro angular é distribuído igualmente e a soma corrigida fecha', () => {
  const ex = poligonalDe(QUADRADO, { ruidoAng: (i) => [8, -2, 6, 0][i] });
  const r = calcular({ ...ex, tolAngular: 10 });
  perto(r.angular.erro * 3600, 12, 1e-6);
  perto(r.angular.correcao * 3600, -3, 1e-6);
  const somaCorr = r.estacoes.reduce((s, e) => s + e.anguloCorrigido, 0);
  perto(somaCorr, 360, 1e-9);
  perto(r.angular.tolerancia * 3600, 20, 1e-9); // 10" × √4
  assert.equal(r.angular.ok, true);
  const r2 = calcular({ ...ex, tolAngular: 5 });
  assert.equal(r2.angular.ok, false);
});

test('compensação de Bowditch fecha exatamente e é proporcional às distâncias', () => {
  const ex = poligonalDe(QUADRADO, { ruidoDist: (i) => [0.02, 0, -0.01, 0.015][i] });
  const r = calcular(ex);
  assert.ok(r.linear.erro > 0.01);
  perto(r.lados.reduce((s, l) => s + l.dEc, 0), 0, 1e-9);
  perto(r.lados.reduce((s, l) => s + l.dNc, 0), 0, 1e-9);
  const k = r.lados.map((l) => Math.hypot(l.cE, l.cN) / l.dist);
  k.forEach((v) => perto(v, k[0], 1e-9, 'proporcionalidade'));
  perto(r.linear.precisao, r.perimetro / r.linear.erro, 1e-9);
});

test('compensação pelo método do trânsito também fecha', () => {
  const ex = poligonalDe(QUADRADO, { ruidoDist: (i) => [0.02, 0, -0.01, 0.015][i] });
  const r = calcular({ ...ex, compensacao: 'transito' });
  perto(r.lados.reduce((s, l) => s + l.dEc, 0), 0, 1e-9);
  perto(r.lados.reduce((s, l) => s + l.dNc, 0), 0, 1e-9);
});

test('poligonal enquadrada entre dois pares de pontos conhecidos', () => {
  // caminho verdadeiro A → B → X1 → X2 → C → D
  const A = { e: 1000, n: 900 }, B = { e: 1000, n: 1000 }, X1 = { e: 1080, n: 1060 },
    X2 = { e: 1170, n: 1040 }, C = { e: 1250, n: 1100 }, D = { e: 1350, n: 1100 };
  const cam = [A, B, X1, X2, C, D];
  const estacoes = [1, 2, 3, 4].map((i) => ({
    nome: ['B', 'X1', 'X2', 'C'][i - 1],
    angulo: norm360(inverso(cam[i], cam[i + 1]).az - inverso(cam[i], cam[i - 1]).az) + (i === 2 ? 6 / 3600 : 0),
    distancia: i < 4 ? inverso(cam[i], cam[i + 1]).dist + (i === 1 ? 0.01 : 0) : '',
  }));
  const r = calcular({ tipo: 'enquadrada', estacoes, refs: { re: A, partida: B, chegada: C, vante: D } });
  perto(r.angular.erro * 3600, 6, 1e-6, 'erro angular');
  assert.ok(r.linear.erro > 0.005 && r.linear.erro < 0.02);
  const ult = r.estacoes[r.estacoes.length - 1];
  perto(ult.e, C.e, 1e-9); perto(ult.n, C.n, 1e-9);
  perto(r.estacoes[1].e, X1.e, 0.02); perto(r.estacoes[2].n, X2.n, 0.02);
});

test('exemplo embutido tem precisão melhor que 1:20.000 e erro angular dentro da tolerância', () => {
  const r = calcular(EXEMPLO);
  assert.equal(r.angular.ok, true);
  assert.equal(r.linear.ok, true);
  assert.ok(r.linear.precisao > 20000, `precisão 1:${Math.round(r.linear.precisao)}`);
  perto(r.area, 39579, 5);
});

test('validações de entrada', () => {
  assert.throws(() => calcular({ estacoes: [] }), /3 estações/);
  assert.throws(() => calcular({ ...EXEMPLO, estacoes: EXEMPLO.estacoes.map((e, i) => (i === 2 ? { ...e, distancia: '0' } : e)) }), /distância inválida em P3/);
  assert.throws(() => calcular({ ...EXEMPLO, tipo: 'enquadrada' }), /4 pontos/);
});

test('CSV com vírgula decimal e DXF R12 válido', () => {
  const r = calcular(EXEMPLO);
  const csv = paraCSV(r).trim().split('\r\n');
  assert.equal(csv.length, 1 + EXEMPLO.estacoes.length);
  assert.match(csv[1], /^P1;117°50'46\.0";/);
  assert.match(csv[1], /;500000,000;8600000,000$/);
  const dxf = paraDXF(r);
  assert.ok(dxf.includes('POLIGONAL') && dxf.trim().endsWith('EOF'));
  assert.equal((dxf.match(/\r\nVERTEX\r\n/g) || []).length, 6);
});

test('lerTabela aceita colagem de planilha com cabeçalho', () => {
  const t = 'Estação\tÂngulo\tDistância\nP1\t117 50 46\t131,804\nP2;119°54\'45";136.705\n';
  const e = lerTabela(t);
  assert.equal(e.length, 2);
  assert.deepEqual(e[0], { nome: 'P1', angulo: '117 50 46', distancia: '131,804' });
  const r = calcular({ ...EXEMPLO, estacoes: lerTabela(EXEMPLO.estacoes.map((s) => `${s.nome};${s.angulo};${s.distancia.replace('.', ',')}`).join('\n')) });
  assert.equal(r.angular.ok, true);
});

test('lê arquivo .M21: ré/vante, ângulo horário, distância média e irradiações ignoradas', async () => {
  const { gerarM21, VERDADE } = await import('./gerar-m21.mjs');
  const { poligonalDeM21, lerM21 } = await import('../src/poligonal.js');
  const p = poligonalDeM21(gerarM21());
  assert.equal(p.fechada, true);
  assert.equal(p.estacoes.length, 6);
  assert.equal(p.irradiacoes, 1);
  assert.deepEqual(p.estacoes.map((e) => e.nome), ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  const r = calcular({ tipo: 'fechada', azInicial: inverso(VERDADE[0], VERDADE[1]).az, inicio: VERDADE[0], estacoes: p.estacoes });
  perto(r.angular.erro * 3600, 0, 1.5); // leituras arredondadas ao segundo
  r.estacoes.forEach((e, i) => { perto(e.e, VERDADE[i].e, 0.01); perto(e.n, VERDADE[i].n, 0.01); });
  // ré renomeada com crase e leituras repetidas
  const t = "_'A_(E_)1.5\r\n_+B`Z_ ?+00010000m0900000+0000002d+00010000t60+27+00100_*R_,1.6\r\n_+Z_ ?+00010000m0900000+3595958d+00010000t60+27+00100_*R_,1.6\r\n_+C_ ?+00020000m0900000+0900000d+00020000t60+27+00100_*V_,1.6\r\n";
  const o = lerM21(t)[0];
  assert.equal(o.re[0].ponto, 'Z');
  const q = poligonalDeM21(t);
  perto(q.estacoes[0].angulo, 90, 1e-9);
  assert.throws(() => poligonalDeM21("_'A_(E_)1.5\r\n_+1_ ?+00010000m0900000+0000000d+00010000t60+27+00100_*CERCA_,1.6"), /ré/);
});

test('fator de escala multiplica as distâncias', () => {
  const r1 = calcular(EXEMPLO), r2 = calcular({ ...EXEMPLO, fatorEscala: 0.9995 });
  perto(r2.perimetro, r1.perimetro * 0.9995, 1e-6);
});

test('relatório HTML traz resumo, croqui e planilha', async () => {
  const { relatorioHTML, desenhoSVG } = await import('../src/relatorio.js');
  const r = calcular(EXEMPLO);
  const svg = desenhoSVG(r);
  assert.ok(svg.startsWith('<svg') && svg.includes('P1'));
  const html = relatorioHTML(r, { titulo: 'Teste <b>', arquivo: 'x.M21' });
  assert.ok(html.includes('Teste &lt;b&gt;') && html.includes('ATENDE') && html.includes('<svg'));
  assert.equal((html.match(/<tr><td>P\d/g) || []).length, 6);
});
