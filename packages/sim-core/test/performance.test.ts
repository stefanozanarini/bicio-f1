import { describe, expect, it } from 'vitest';
import { accelerationRun, brakingDistance, maxLateralG, newProvingSim } from '../scripts/scenarios.ts';

/**
 * Test "golden": le prestazioni della vettura di default devono restare in intervalli
 * realistici per una F1 2026. Se una modifica alla fisica li fa uscire, va giustificata.
 */
describe('prestazioni vettura 2026', () => {
  const acc = accelerationRun();

  it('accelerazione', () => {
    expect(acc.t100).toBeGreaterThan(2.1);
    expect(acc.t100).toBeLessThan(2.9);
    expect(acc.t200).toBeGreaterThan(4.0);
    expect(acc.t200).toBeLessThan(5.5);
    expect(acc.topSpeed).toBeGreaterThan(330);
    expect(acc.topSpeed).toBeLessThan(370);
  });

  it('frenata', () => {
    const b100 = brakingDistance(100);
    expect(b100.distance).toBeGreaterThan(14);
    expect(b100.distance).toBeLessThan(22);
    const b200 = brakingDistance(200);
    expect(b200.distance).toBeGreaterThan(45);
    expect(b200.distance).toBeLessThan(70);
  });

  it('accelerazione laterale: meccanica in lenta, aerodinamica in veloce', () => {
    const slow = maxLateralG(80);
    const fast = maxLateralG(280);
    expect(slow).toBeGreaterThan(1.5);
    expect(slow).toBeLessThan(2.3);
    expect(fast).toBeGreaterThan(3.6);
    expect(fast).toBeLessThan(5.2);
  });

  it('limitatore: in 1a a gas pieno il motore non supera il regime massimo', () => {
    const sim = newProvingSim();
    sim.aids.autoShift = false;
    sim.input.throttleKey = true;
    let maxRpm = 0;
    for (let i = 0; i < 500 * 8; i++) {
      sim.step();
      maxRpm = Math.max(maxRpm, sim.car.engineRpm);
    }
    expect(maxRpm).toBeLessThan(sim.car.params.engine.limiterRpm + 250);
    expect(sim.car.u * 3.6).toBeLessThan(100);
  });

  it('ferma in folle: non si muove da sola', () => {
    const sim = newProvingSim();
    const x0 = sim.car.x;
    const y0 = sim.car.y;
    sim.advance(500 * 10);
    expect(Math.hypot(sim.car.x - x0, sim.car.y - y0)).toBeLessThan(0.05);
  });

  it('ERS: la batteria si scarica in accelerazione e si ricarica in frenata', () => {
    const sim = newProvingSim();
    const full = sim.car.ersStore;
    sim.input.throttleKey = true;
    sim.advance(500 * 6);
    const afterAccel = sim.car.ersStore;
    expect(afterAccel).toBeLessThan(full);
    sim.input.throttleKey = false;
    sim.input.brakeAxis = 1;
    sim.advance(500 * 3);
    expect(sim.car.ersStore).toBeGreaterThan(afterAccel);
  });
});
