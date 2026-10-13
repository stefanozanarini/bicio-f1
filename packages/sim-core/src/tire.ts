import { atan, hypot, max, sin, tan } from './dmath.ts';
import type { TireParams } from './params.ts';

/**
 * Modello gomma: Pacejka Magic Formula con slittamento combinato.
 *
 * Gli slittamenti longitudinale (kappa) e laterale (tan alpha) vengono normalizzati
 * rispetto ai rispettivi valori di picco e combinati in un unico slittamento s.
 * La forza totale è D * sin(C * atan(B * s)), con B scelto in modo che il picco cada
 * esattamente a s = 1, e viene ripartita lungo la direzione dello slittamento.
 * In questo modo frenare o accelerare in curva "consuma" aderenza laterale come in
 * una gomma reale (ellisse d'attrito).
 */

export interface TireForces {
  fx: number;
  fy: number;
  /** Slittamento combinato normalizzato (1 = picco di aderenza) */
  combinedSlip: number;
}

/** B tale che C * atan(B) = PI/2, cioè picco della curva a s = 1. */
export function shapeB(shapeC: number): number {
  return tan(1.5707963267948966 / shapeC);
}

export function peakMu(p: TireParams, fz: number): number {
  const mu = p.mu0 * (1 - p.loadSens * (fz / p.fz0 - 1));
  return max(mu, p.mu0 * 0.5);
}

export function computeTireForces(
  p: TireParams,
  b: number,
  fz: number,
  kappa: number,
  tanAlpha: number,
  surfaceMu: number,
  out: TireForces,
): TireForces {
  if (fz <= 0) {
    out.fx = 0;
    out.fy = 0;
    out.combinedSlip = 0;
    return out;
  }
  const sx = kappa / p.peakSlipRatio;
  const sy = tanAlpha / tan(p.peakSlipAngle);
  const s = hypot(sx, sy);
  out.combinedSlip = s;
  if (s < 1e-9) {
    out.fx = 0;
    out.fy = 0;
    return out;
  }
  const d = peakMu(p, fz) * surfaceMu * fz;
  const f = d * sin(p.shapeC * atan(b * s));
  out.fx = ((f * sx) / s) * p.longGripScale;
  out.fy = (f * sy) / s;
  return out;
}
