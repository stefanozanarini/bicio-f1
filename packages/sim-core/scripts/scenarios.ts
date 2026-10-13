/**
 * Scenari di prova standard per misurare le prestazioni della vettura.
 * Usati sia dai test "golden" sia dallo script `npm run metrics`.
 */
import { DT, Simulation, type SimOptions } from '../src/sim.ts';
import type { TrackDef } from '../src/track.ts';
import { defaultAids } from '../src/controls.ts';

/** Area di prova: ovale enorme e larghissimo, tutto asfalto. */
export const PROVING_GROUND: TrackDef = {
  id: 'proving-ground',
  name: 'Area di prova',
  width: 4000,
  kerbWidth: 0,
  kerbCurvature: 1,
  controlPoints: [
    [0, 0],
    [3000, 0],
    [6000, 0],
    [9000, 0],
    [10500, 3000],
    [9000, 6000],
    [6000, 6000],
    [3000, 6000],
    [0, 6000],
    [-1500, 3000],
  ],
};

export function newProvingSim(opts: SimOptions = {}): Simulation {
  const sim = new Simulation(PROVING_GROUND, {
    aids: { ...defaultAids(), abs: true, tractionControl: true, autoShift: true, steerLimit: 0 },
    startOffset: 0,
    ...opts,
  });
  sim.placeAt(100);
  return sim;
}

export interface AccelResult {
  t100: number;
  t200: number;
  t300: number;
  speedAt1000m: number;
  topSpeed: number;
}

export function accelerationRun(sim = newProvingSim()): AccelResult {
  const res: AccelResult = { t100: NaN, t200: NaN, t300: NaN, speedAt1000m: NaN, topSpeed: 0 };
  sim.input.throttleKey = true;
  const x0 = sim.car.x;
  const t0 = sim.time;
  while (sim.time - t0 < 40) {
    sim.step();
    const kmh = sim.car.u * 3.6;
    const t = sim.time - t0;
    if (Number.isNaN(res.t100) && kmh >= 100) res.t100 = t;
    if (Number.isNaN(res.t200) && kmh >= 200) res.t200 = t;
    if (Number.isNaN(res.t300) && kmh >= 300) res.t300 = t;
    if (Number.isNaN(res.speedAt1000m) && sim.car.x - x0 >= 1000) res.speedAt1000m = kmh;
    if (kmh > res.topSpeed) res.topSpeed = kmh;
  }
  sim.input.throttleKey = false;
  return res;
}

/** Porta l'auto alla velocità richiesta in linea retta. */
export function reachSpeed(sim: Simulation, kmh: number): void {
  sim.input.throttleKey = true;
  let guard = 0;
  while (sim.car.u * 3.6 < kmh && guard++ < 60 / DT) sim.step();
  sim.input.throttleKey = false;
}

export function brakingDistance(fromKmh: number, abs = true): { distance: number; time: number } {
  const sim = newProvingSim();
  sim.aids.abs = abs;
  reachSpeed(sim, fromKmh);
  sim.input.brakeAxis = 1;
  const x0 = sim.car.x;
  const t0 = sim.time;
  while (sim.car.u > 0.3 && sim.time - t0 < 20) sim.step();
  sim.input.brakeAxis = 0;
  return { distance: sim.car.x - x0, time: sim.time - t0 };
}

/**
 * Accelerazione laterale massima a velocità costante: sterzata progressiva lenta
 * mentre un regolatore tiene la velocità. Restituisce il massimo valore stabile in g.
 */
export function maxLateralG(kmh: number): number {
  const sim = newProvingSim();
  sim.aids.tractionControl = true;
  reachSpeed(sim, kmh);
  const target = kmh / 3.6;
  let steer = 0;
  let best = 0;
  let integ = 0;
  const t0 = sim.time;
  while (sim.time - t0 < 12) {
    const err = target - sim.car.u;
    integ += err * DT;
    const cmd = 0.4 * err + 0.3 * integ;
    sim.input.throttleAxis = Math.max(0, Math.min(1, cmd));
    sim.input.brakeAxis = Math.max(0, Math.min(1, -cmd));
    steer += 0.04 * DT; // rampa lenta: 0.04 della corsa al secondo
    sim.input.steerAxis = steer;
    sim.step();
    const g = Math.abs(sim.car.ay) / 9.81;
    // Consideriamo solo condizioni quasi stazionarie: velocità vicina al target
    if (Math.abs(sim.car.u - target) < 0.03 * target && g > best) best = g;
    // Testacoda: fine prova
    if (Math.abs(sim.car.v) > 0.25 * Math.abs(sim.car.u)) break;
  }
  return best;
}
