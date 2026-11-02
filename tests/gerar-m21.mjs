// Gera um arquivo .M21 fictício (poligonal fechada de 6 vértices) no formato da caderneta da estação total.
import { inverso, norm360 } from '../src/poligonal.js';

const P = [[500000, 8600000], [500118.4, 8599942.1], [500231.7, 8600018.6], [500210.3, 8600139.9],
  [500097.6, 8600181.2], [499996.8, 8600102.5]].map(([e, n], i) => ({ nome: `P${i + 1}`, e, n }));
const gmsC = (g) => {
  let s = Math.round(norm360(g) * 3600);
  if (s >= 360 * 3600) s -= 360 * 3600;
  const G = Math.floor(s / 3600), M = Math.floor((s % 3600) / 60), S = s % 60;
  return `${String(G).padStart(3, '0')}${String(M).padStart(2, '0')}${String(S).padStart(2, '0')}`;
};
const mm = (m) => String(Math.round(m * 1000)).padStart(8, '0');

export function gerarM21({ ruidoHz = () => 0 } = {}) {
  const n = P.length, out = [];
  P.forEach((s, i) => {
    const re = P[(i - 1 + n) % n], v = P[(i + 1) % n];
    const azRe = inverso(s, re).az;
    out.push(`_'${s.nome}_(E_)1.550`);
    const linha = (alvo, hz, cod) => {
      const d = inverso(s, alvo).dist;
      return `_+${alvo.nome}_ ?+${mm(d)}m0900000+${gmsC(hz)}d+${mm(d)}t60+27+00100_*${cod}_,1.600`;
    };
    out.push(linha(re, 0, 'R'));
    out.push(linha(v, norm360(inverso(s, v).az - azRe) + ruidoHz(i) / 3600, 'V'));
    if (i === 2) out.push(`_+100_ ?+00025000m0900000+0450000d+00025000t60+27+00100_*CERCA_,1.600`);
  });
  return out.join('\r\n') + '\r\n';
}
export const VERDADE = P;

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(gerarM21({ ruidoHz: (i) => [3, -2, 4, 0, -1, 2][i] }));
