import { describe, expect, it } from 'vitest';
import { Simulation, TEST_TRACK } from '../src/index.ts';

/** Generatore pseudo-casuale deterministico per gli input di prova. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drive(seed: number, ticks: number): Simulation {
  const sim = new Simulation(TEST_TRACK);
  const r = rng(seed);
  for (let i = 0; i < ticks; i++) {
    if (i % 25 === 0) {
      const x = r();
      sim.input.throttleKey = x < 0.7;
      sim.input.brakeKey = x > 0.85;
      sim.input.steerLeft = r() < 0.2;
      sim.input.steerRight = r() < 0.2;
      sim.input.shiftUp = r() < 0.1;
      sim.input.shiftDown = r() < 0.05;
    }
    sim.step();
  }
  return sim;
}

describe('determinismo', () => {
  it('stessi input, stesso stato bit per bit', () => {
    const a = drive(42, 20_000);
    const b = drive(42, 20_000);
    expect(a.car.x).toBe(b.car.x);
    expect(a.car.y).toBe(b.car.y);
    expect(a.car.heading).toBe(b.car.heading);
    expect(a.car.u).toBe(b.car.u);
    expect(a.car.wheels.map((w) => w.omega)).toEqual(b.car.wheels.map((w) => w.omega));
  });

  it('input casuali per 3 minuti: nessun NaN, velocità sensate', () => {
    for (const seed of [1, 2, 3]) {
      const sim = drive(seed, 500 * 180);
      const c = sim.car;
      for (const v of [c.x, c.y, c.u, c.v, c.r, c.heading, ...c.wheels.map((w) => w.omega)]) expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(c.u)).toBeLessThan(110);
    }
  });
});
