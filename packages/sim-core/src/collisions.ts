import type { Car } from './car.ts';
import { clamp, cos, sin, sqrt } from './dmath.ts';

/** Sagoma dell'auto approssimata con cerchi lungo l'asse: posizione [m] e raggio [m]. */
const CIRCLES: readonly (readonly [number, number])[] = [
  [2.35, 0.5],
  [1.4, 0.95],
  [0.0, 0.9],
  [-1.45, 0.95],
];
const RESTITUTION = 0.2;
const FRICTION = 0.35;

const va = { x: 0, y: 0 };
const vb = { x: 0, y: 0 };

/**
 * Contatti tra auto: per ogni coppia di cerchi compenetrati applica un impulso lungo la
 * normale (con rimbalzo limitato) e uno d'attrito tangenziale, poi separa le auto.
 * Restituisce l'intensità dell'urto più forte [m/s di velocità relativa], per effetti e danni.
 */
export function resolveCollisions(cars: readonly Car[]): number {
  let strongest = 0;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const ddx = b.x - a.x;
      const ddy = b.y - a.y;
      if (ddx * ddx + ddy * ddy > 49) continue;
      const ca = cos(a.heading);
      const sa = sin(a.heading);
      const cb = cos(b.heading);
      const sb = sin(b.heading);
      for (const [oa, ra] of CIRCLES) {
        const ax = a.x + ca * oa;
        const ay = a.y + sa * oa;
        for (const [ob, rb] of CIRCLES) {
          const bx = b.x + cb * ob;
          const by = b.y + sb * ob;
          const dx = bx - ax;
          const dy = by - ay;
          const d2 = dx * dx + dy * dy;
          const rr = ra + rb;
          if (d2 >= rr * rr || d2 < 1e-9) continue;
          const d = sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const pen = rr - d;
          const px = ax + nx * ra;
          const py = ay + ny * ra;
          a.pointVelocity(px, py, va);
          b.pointVelocity(px, py, vb);
          const rvx = vb.x - va.x;
          const rvy = vb.y - va.y;
          const vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            const ma = a.params.chassis.mass;
            const mb = b.params.chassis.mass;
            const ia = a.params.chassis.yawInertia;
            const ib = b.params.chassis.yawInertia;
            const rax = px - a.x;
            const ray = py - a.y;
            const rbx = px - b.x;
            const rby = py - b.y;
            const crA = rax * ny - ray * nx;
            const crB = rbx * ny - rby * nx;
            const k = 1 / ma + 1 / mb + (crA * crA) / ia + (crB * crB) / ib;
            const jn = (-(1 + RESTITUTION) * vn) / k;
            // Attrito tangenziale, limitato dal cono di Coulomb
            const tx = -ny;
            const ty = nx;
            const vt = rvx * tx + rvy * ty;
            const crAt = rax * ty - ray * tx;
            const crBt = rbx * ty - rby * tx;
            const kt = 1 / ma + 1 / mb + (crAt * crAt) / ia + (crBt * crBt) / ib;
            const jt = clamp(-vt / kt, -FRICTION * jn, FRICTION * jn);
            const jx = jn * nx + jt * tx;
            const jy = jn * ny + jt * ty;
            b.applyImpulse(px, py, jx, jy);
            a.applyImpulse(px, py, -jx, -jy);
            if (-vn > strongest) strongest = -vn;
          }
          // Separazione delle sagome compenetrate
          const corr = pen * 0.5;
          a.x -= nx * corr;
          a.y -= ny * corr;
          b.x += nx * corr;
          b.y += ny * corr;
        }
      }
    }
  }
  return strongest;
}
