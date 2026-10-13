import { abs, atan2, clamp, max, min, sqrt, wrapAngle } from './dmath.ts';
import type { CarParams } from './params.ts';
import type { Track } from './track.ts';

const G = 9.81;
const AIR = 1.225;

/**
 * Traiettoria ideale di una pista: scostamento laterale dalla linea centrale che
 * riduce al minimo la curvatura (si allarga in ingresso, stringe la corda, riapre
 * in uscita), calcolato una volta per pista con un rilassamento iterativo.
 */
export class RacingLine {
  readonly track: Track;
  readonly count: number;
  /** Scostamento laterale dalla linea centrale, positivo a sinistra [m] */
  readonly offset: Float64Array;
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Curvatura della traiettoria (con segno) [1/m] */
  readonly curvature: Float64Array;

  constructor(track: Track, margin = 1.7) {
    this.track = track;
    const n = track.count;
    this.count = n;
    const step = 5;
    const m = Math.floor(n / step);
    const limit = track.halfWidth - margin;
    const cx = new Float64Array(m);
    const cy = new Float64Array(m);
    const nx = new Float64Array(m);
    const ny = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      const i = k * step;
      cx[k] = track.px[i];
      cy[k] = track.py[i];
      nx[k] = -track.ty[i];
      ny[k] = track.tx[i];
    }
    const o = new Float64Array(m);
    const px = (k: number) => cx[(k + m) % m] + nx[(k + m) % m] * o[(k + m) % m];
    const py = (k: number) => cy[(k + m) % m] + ny[(k + m) % m] * o[(k + m) % m];
    // Rilassamento: mescola minima curvatura (punti a distanza 2) e percorso più corto
    for (let it = 0; it < 1500; it++) {
      for (let k = 0; k < m; k++) {
        const curvX = (-px(k - 2) + 4 * px(k - 1) + 4 * px(k + 1) - px(k + 2)) / 6;
        const curvY = (-py(k - 2) + 4 * py(k - 1) + 4 * py(k + 1) - py(k + 2)) / 6;
        const lapX = (px(k - 1) + px(k + 1)) / 2;
        const lapY = (py(k - 1) + py(k + 1)) / 2;
        const tx = 0.75 * curvX + 0.25 * lapX;
        const ty = 0.75 * curvY + 0.25 * lapY;
        const d = (tx - px(k)) * nx[k] + (ty - py(k)) * ny[k];
        o[k] = clamp(o[k] + 0.6 * d, -limit, limit);
      }
    }
    // Ritorno alla risoluzione piena con interpolazione cubica (Catmull-Rom)
    this.offset = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const k = Math.floor(i / step);
      const t = (i - k * step) / step;
      const p0 = o[(k - 1 + m) % m];
      const p1 = o[k % m];
      const p2 = o[(k + 1) % m];
      const p3 = o[(k + 2) % m];
      const t2 = t * t;
      const t3 = t2 * t;
      const v = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      this.offset[i] = clamp(v, -limit, limit);
    }
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = track.px[i] - track.ty[i] * this.offset[i];
      this.y[i] = track.py[i] + track.tx[i] * this.offset[i];
    }
    // Curvatura della traiettoria, mediata su ~20 m
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 2 + n) % n;
      const b = i;
      const c = (i + 2) % n;
      const h0 = atan2(this.y[b] - this.y[a], this.x[b] - this.x[a]);
      const h1 = atan2(this.y[c] - this.y[b], this.x[c] - this.x[b]);
      const ex = this.x[c] - this.x[a];
      const ey = this.y[c] - this.y[a];
      const ds = sqrt(ex * ex + ey * ey) / 2;
      raw[i] = wrapAngle(h1 - h0) / max(ds, 0.1);
    }
    this.curvature = new Float64Array(n);
    const w = 4;
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let k = -w; k <= w; k++) acc += raw[(i + k + n) % n];
      this.curvature[i] = acc / (2 * w + 1);
    }
  }

  /** Indice del punto più vicino della traiettoria, cercando attorno a hint. */
  nearest(x: number, y: number, hint: number): number {
    const n = this.count;
    let best = hint;
    let bestD = Infinity;
    const from = hint < 0 ? 0 : -30;
    const to = hint < 0 ? n - 1 : 30;
    for (let k = from; k <= to; k++) {
      const i = hint < 0 ? k : (hint + k + n) % n;
      const dx = x - this.x[i];
      const dy = y - this.y[i];
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (hint >= 0 && bestD > 40 * 40) return this.nearest(x, y, -1);
    return best;
  }
}

export interface ProfileOptions {
  /** Frazione dell'aderenza sfruttata in curva */
  gripFactor: number;
  /** Frazione della decelerazione massima usata in frenata */
  brakeFactor: number;
}

/**
 * Profilo di velocità lungo la traiettoria: limite di aderenza laterale (con il carico
 * aerodinamico), poi passate in avanti (accelerazione limitata da trazione e potenza)
 * e all'indietro (frenata), con l'ellisse d'attrito tra componente laterale e longitudinale.
 */
export function speedProfile(line: RacingLine, car: CarParams, opts: ProfileOptions): Float64Array {
  const n = line.count;
  const ds = line.track.spacing;
  const m = car.chassis.mass;
  const mu = car.tireFront.mu0 * 0.92 * opts.gripFactor;
  const ka = (0.5 * AIR * car.aero.clA) / m;
  const kd = (0.5 * AIR * car.aero.cdA) / m;
  const power = 650_000;
  const vmax = 96;
  const v = new Float64Array(n);
  const aLatMax = (s: number) => mu * (G + ka * s * s);
  for (let i = 0; i < n; i++) {
    const k = abs(line.curvature[i]);
    const den = k - mu * ka;
    v[i] = den <= 1e-6 ? vmax : min(vmax, sqrt((mu * G) / den));
  }
  const usage = (s: number, k: number) => {
    const lat = s * s * abs(k);
    const lim = aLatMax(s);
    const r = clamp(lat / lim, 0, 1);
    return sqrt(max(0, 1 - r * r));
  };
  // Due giri per gestire la chiusura del circuito
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < n; j++) {
      const i = j % n;
      const nx = (i + 1) % n;
      const s = v[i];
      const traction = mu * (G * 0.6 + ka * s * s * 0.55);
      const acc = min(traction, power / (m * max(s, 5))) * usage(s, line.curvature[i]) - kd * s * s;
      v[nx] = min(v[nx], sqrt(max(0, s * s + 2 * ds * max(acc, 0))));
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let j = n - 1; j >= 0; j--) {
      const i = j;
      const nx = (i + 1) % n;
      const s = v[nx];
      const brake = (mu * (G + ka * s * s) * usage(s, line.curvature[nx]) + kd * s * s) * opts.brakeFactor;
      v[i] = min(v[i], sqrt(s * s + 2 * ds * brake));
    }
  }
  return v;
}
