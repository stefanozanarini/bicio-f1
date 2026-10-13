import { abs, atan2, hypot, max, min, sqrt, wrapAngle } from './dmath.ts';

/** Superfici. In fase 2 cordoli e vie di fuga avranno profilo e comportamento propri. */
export enum Surface {
  Asphalt = 0,
  Kerb = 1,
  Grass = 2,
}

export interface SurfaceProps {
  /** Moltiplicatore dell'aderenza della gomma */
  mu: number;
  /** Resistenza al rotolamento aggiuntiva (frazione del carico) */
  extraRolling: number;
}

export const SURFACES: Record<Surface, SurfaceProps> = {
  [Surface.Asphalt]: { mu: 1.0, extraRolling: 0 },
  [Surface.Kerb]: { mu: 0.92, extraRolling: 0.005 },
  [Surface.Grass]: { mu: 0.5, extraRolling: 0.06 },
};

export interface TrackDef {
  id: string;
  name: string;
  /** Punti di controllo della linea centrale (circuito chiuso), in metri */
  controlPoints: ReadonlyArray<readonly [number, number]>;
  /** Larghezza della carreggiata [m] */
  width: number;
  /** Larghezza dei cordoli oltre la linea bianca [m] */
  kerbWidth: number;
  /** Curvatura oltre la quale si posano i cordoli [1/m] */
  kerbCurvature: number;
}

export interface TrackQuery {
  index: number;
  /** Distanza lungo la linea centrale [m] */
  s: number;
  /** Scostamento laterale dalla linea centrale, positivo a sinistra [m] */
  lateral: number;
  surface: Surface;
  /** Oltre la linea bianca (limiti della pista) */
  offTrack: boolean;
}

/**
 * Pista costruita da una spline Catmull-Rom chiusa, campionata a passo costante.
 * La stessa descrizione genera sia la geometria fisica sia la mesh 3D.
 */
export class Track {
  readonly def: TrackDef;
  readonly spacing: number;
  readonly length: number;
  readonly count: number;
  readonly px: Float64Array;
  readonly py: Float64Array;
  /** Tangente unitaria */
  readonly tx: Float64Array;
  readonly ty: Float64Array;
  readonly s: Float64Array;
  /** Curvatura con segno (positiva = curva a sinistra) [1/m] */
  readonly curvature: Float64Array;
  readonly kerb: Uint8Array;
  readonly halfWidth: number;

  constructor(def: TrackDef, spacing = 2) {
    this.def = def;
    this.spacing = spacing;
    this.halfWidth = def.width / 2;

    // 1) Campionamento fitto della spline
    const pts = def.controlPoints;
    const n = pts.length;
    const sub = 64;
    const dx: number[] = [];
    const dy: number[] = [];
    const tmp: [number, number] = [0, 0];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      for (let k = 0; k < sub; k++) {
        centripetalCatmull(p0, p1, p2, p3, k / sub, tmp);
        dx.push(tmp[0]);
        dy.push(tmp[1]);
      }
    }
    const m = dx.length;
    const cum = new Float64Array(m + 1);
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      cum[i + 1] = cum[i] + hypot(dx[j] - dx[i], dy[j] - dy[i]);
    }
    const total = cum[m];

    // 2) Ricampionamento a passo costante
    const count = Math.floor(total / spacing);
    this.count = count;
    this.length = count * spacing;
    const scale = total / this.length;
    this.px = new Float64Array(count);
    this.py = new Float64Array(count);
    this.tx = new Float64Array(count);
    this.ty = new Float64Array(count);
    this.s = new Float64Array(count);
    this.curvature = new Float64Array(count);
    this.kerb = new Uint8Array(count);
    let seg = 0;
    for (let i = 0; i < count; i++) {
      const target = i * spacing * scale;
      while (cum[seg + 1] < target) seg++;
      const t = (target - cum[seg]) / (cum[seg + 1] - cum[seg]);
      const j = (seg + 1) % m;
      this.px[i] = dx[seg] + (dx[j] - dx[seg]) * t;
      this.py[i] = dy[seg] + (dy[j] - dy[seg]) * t;
      this.s[i] = i * spacing;
    }
    // 3) Tangenti e curvatura
    for (let i = 0; i < count; i++) {
      const a = (i - 1 + count) % count;
      const b = (i + 1) % count;
      const ex = this.px[b] - this.px[a];
      const ey = this.py[b] - this.py[a];
      const l = sqrt(ex * ex + ey * ey);
      this.tx[i] = ex / l;
      this.ty[i] = ey / l;
    }
    for (let i = 0; i < count; i++) {
      const a = (i - 1 + count) % count;
      const b = (i + 1) % count;
      const h0 = atan2(this.ty[a], this.tx[a]);
      const h1 = atan2(this.ty[b], this.tx[b]);
      this.curvature[i] = wrapAngle(h1 - h0) / (2 * spacing);
    }
    // 4) Cordoli dove la curvatura (media su ~20 m) supera la soglia
    const win = max(1, Math.round(10 / spacing));
    for (let i = 0; i < count; i++) {
      let acc = 0;
      for (let k = -win; k <= win; k++) acc += abs(this.curvature[(i + k + count) % count]);
      this.kerb[i] = acc / (2 * win + 1) > def.kerbCurvature ? 1 : 0;
    }
  }

  /** Punto più vicino sulla linea centrale. hint = indice precedente (ricerca locale). */
  query(x: number, y: number, hint: number, out: TrackQuery): TrackQuery {
    const c = this.count;
    let best = -1;
    let bestD = Infinity;
    if (hint >= 0) {
      for (let k = -40; k <= 40; k++) {
        const i = (hint + k + c) % c;
        const ex = x - this.px[i];
        const ey = y - this.py[i];
        const d = ex * ex + ey * ey;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    if (best < 0 || bestD > 60 * 60) {
      bestD = Infinity;
      for (let i = 0; i < c; i++) {
        const ex = x - this.px[i];
        const ey = y - this.py[i];
        const d = ex * ex + ey * ey;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    const ex = x - this.px[best];
    const ey = y - this.py[best];
    const along = ex * this.tx[best] + ey * this.ty[best];
    const lateral = -ex * this.ty[best] + ey * this.tx[best];
    let s = this.s[best] + along;
    if (s < 0) s += this.length;
    else if (s >= this.length) s -= this.length;
    const al = abs(lateral);
    const hw = this.halfWidth;
    let surface: Surface;
    if (al <= hw) surface = Surface.Asphalt;
    else if (al <= hw + this.def.kerbWidth && this.kerb[best]) surface = Surface.Kerb;
    else surface = Surface.Grass;
    out.index = best;
    out.s = s;
    out.lateral = lateral;
    out.surface = surface;
    out.offTrack = al > hw;
    return out;
  }

  /** Posizione e direzione sulla linea centrale alla distanza s. */
  poseAt(s: number): { x: number; y: number; heading: number; index: number } {
    let ss = s % this.length;
    if (ss < 0) ss += this.length;
    const i = min(this.count - 1, Math.floor(ss / this.spacing));
    const t = (ss - i * this.spacing) / this.spacing;
    const j = (i + 1) % this.count;
    return {
      x: this.px[i] + (this.px[j] - this.px[i]) * t,
      y: this.py[i] + (this.py[j] - this.py[i]) * t,
      heading: atan2(this.ty[i], this.tx[i]),
      index: i,
    };
  }
}

type P2 = readonly [number, number];

/**
 * Catmull-Rom centripeta (Barry-Goldman, alpha = 0.5): con punti di controllo a distanze
 * irregolari non produce ricci né cuspidi, a differenza della versione uniforme.
 */
function centripetalCatmull(p0: P2, p1: P2, p2: P2, p3: P2, u: number, out: [number, number]): void {
  const knot = (a: P2, b: P2) => max(sqrt(hypot(b[0] - a[0], b[1] - a[1])), 1e-6);
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * u;
  for (let c = 0; c < 2; c++) {
    const a1 = ((t1 - t) / (t1 - t0)) * p0[c] + ((t - t0) / (t1 - t0)) * p1[c];
    const a2 = ((t2 - t) / (t2 - t1)) * p1[c] + ((t - t1) / (t2 - t1)) * p2[c];
    const a3 = ((t3 - t) / (t3 - t2)) * p2[c] + ((t - t2) / (t3 - t2)) * p3[c];
    const b1 = ((t2 - t) / (t2 - t0)) * a1 + ((t - t0) / (t2 - t0)) * a2;
    const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
    out[c] = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
  }
}
