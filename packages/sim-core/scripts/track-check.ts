/**
 * Analisi di una pista: `npx tsx packages/sim-core/scripts/track-check.ts <id> [file.svg]`
 * Stampa lunghezza, curve, raggio minimo, distanza minima tra tratti non contigui
 * e, se richiesto, salva un disegno SVG del tracciato.
 */
import { writeFileSync } from 'node:fs';
import { Track } from '../src/track.ts';
import { TRACKS } from '../src/tracks/index.ts';

export function analyze(t: Track) {
  const n = t.count;
  const win = Math.round(10 / t.spacing);
  const smooth = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0;
    for (let k = -win; k <= win; k++) a += t.curvature[(i + k + n) % n];
    smooth[i] = a / (2 * win + 1);
  }
  // Curve: tratti con |curvatura| > 1/300, separati da cambi di segno o rettilinei
  const corners: { s: number; minR: number; dir: string; angle: number }[] = [];
  let inC = false;
  let sign = 0;
  let cur = { s: 0, minR: Infinity, dir: '', angle: 0 };
  for (let i = 0; i < n; i++) {
    const k = smooth[i];
    const on = Math.abs(k) > 1 / 300;
    const sg = Math.sign(k);
    if (on && (!inC || sg !== sign)) {
      if (inC) corners.push(cur);
      cur = { s: t.s[i], minR: Infinity, dir: sg > 0 ? 'sx' : 'dx', angle: 0 };
      inC = true;
      sign = sg;
    }
    if (inC && on) {
      cur.minR = Math.min(cur.minR, 1 / Math.abs(k));
      cur.angle += (Math.abs(k) * t.spacing * 180) / Math.PI;
    }
    if (inC && !on) {
      corners.push(cur);
      inC = false;
    }
  }
  if (inC) corners.push(cur);
  const real = corners.filter((c) => c.angle > 12);
  let minR = Infinity;
  for (let i = 0; i < n; i++) minR = Math.min(minR, 1 / Math.abs(t.curvature[i]));
  let minSep = Infinity;
  for (let i = 0; i < n; i += 2)
    for (let j = i + 2; j < n; j += 2) {
      const along = Math.min(j - i, n - (j - i)) * t.spacing;
      if (along < 150) continue;
      minSep = Math.min(minSep, Math.hypot(t.px[i] - t.px[j], t.py[i] - t.py[j]));
    }
  return { length: t.length, corners: real, minR, minSep };
}

function svg(t: Track): string {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < t.count; i++) {
    minX = Math.min(minX, t.px[i]); maxX = Math.max(maxX, t.px[i]);
    minY = Math.min(minY, t.py[i]); maxY = Math.max(maxY, t.py[i]);
  }
  const pad = 60;
  const pts = Array.from({ length: t.count }, (_, i) => `${(t.px[i] - minX + pad).toFixed(1)},${(maxY - t.py[i] + pad).toFixed(1)}`).join(' ');
  const a = analyze(t);
  const labels = a.corners
    .map((c, k) => {
      const p = t.poseAt(c.s + 10);
      return `<text x="${(p.x - minX + pad + 18).toFixed(0)}" y="${(maxY - p.y + pad).toFixed(0)}" font-size="28" fill="#c00">${k + 1}</text>`;
    })
    .join('');
  const p0 = t.poseAt(0);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}" style="background:#eee"><polyline points="${pts}" fill="none" stroke="#333" stroke-width="${t.def.width}" stroke-linejoin="round"/><circle cx="${p0.x - minX + pad}" cy="${maxY - p0.y + pad}" r="14" fill="#0a0"/>${labels}</svg>`;
}

const id = process.argv[2];
const out = process.argv[3];
for (const def of Object.values(TRACKS)) {
  if (id && def.id !== id) continue;
  const t = new Track(def);
  const a = analyze(t);
  console.log(`${def.name}: ${(a.length / 1000).toFixed(2)} km, ${a.corners.length} curve, raggio min ${a.minR.toFixed(0)} m, separazione min ${a.minSep.toFixed(0)} m`);
  console.log('  ' + a.corners.map((c, k) => `${k + 1}:${c.dir} ${c.angle.toFixed(0)}° R${c.minR.toFixed(0)}`).join('  '));
  if (out) writeFileSync(out, svg(t));
}
