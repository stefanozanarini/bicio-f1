import { describe, expect, it } from 'vitest';
import { Simulation, Surface, TEST_TRACK, Track } from '../src/index.ts';

describe('pista di prova', () => {
  const t = new Track(TEST_TRACK);

  it('geometria sensata: lunghezza e raggio minimo', () => {
    expect(t.length).toBeGreaterThan(4500);
    expect(t.length).toBeLessThan(5500);
    let minR = Infinity;
    for (let i = 0; i < t.count; i++) minR = Math.min(minR, 1 / Math.abs(t.curvature[i]));
    expect(minR).toBeGreaterThan(35);
  });

  it('nessuna sovrapposizione tra parti lontane del tracciato', () => {
    let minD = Infinity;
    for (let i = 0; i < t.count; i += 2)
      for (let j = i + 100; j < t.count; j += 2) {
        if (t.count - (j - i) < 100) continue;
        minD = Math.min(minD, Math.hypot(t.px[i] - t.px[j], t.py[i] - t.py[j]));
      }
    expect(minD).toBeGreaterThan(TEST_TRACK.width * 3);
  });

  it('superfici: asfalto al centro, erba lontano', () => {
    const q = { index: 0, s: 0, lateral: 0, surface: Surface.Asphalt, offTrack: false };
    const p = t.poseAt(500);
    t.query(p.x, p.y, -1, q);
    expect(q.surface).toBe(Surface.Asphalt);
    expect(Math.abs(q.s - 500)).toBeLessThan(1);
    const nx = -Math.sin(p.heading);
    const ny = Math.cos(p.heading);
    t.query(p.x + nx * 30, p.y + ny * 30, -1, q);
    expect(q.surface).toBe(Surface.Grass);
    expect(q.offTrack).toBe(true);
    expect(q.lateral).toBeGreaterThan(29);
  });

  it('cronometraggio: un giro completo seguendo la linea centrale', () => {
    const sim = new Simulation(TEST_TRACK, { startOffset: 20 });
    sim.aids.autoShift = true;
    const q = { index: -1, s: 0, lateral: 0, surface: Surface.Asphalt, offTrack: false };
    // Pilota di prova: velocità costante moderata, sterzo su errore laterale e di direzione
    const target = 110 / 3.6;
    for (let i = 0; i < 500 * 240 && sim.lap.last === null; i++) {
      const c = sim.car;
      sim.track.query(c.x, c.y, q.index, q);
      const ahead = sim.track.poseAt(q.s + 8);
      let dh = ahead.heading - c.heading;
      dh -= 2 * Math.PI * Math.round(dh / (2 * Math.PI));
      sim.input.steerAxis = Math.max(-1, Math.min(1, 3 * dh - 0.08 * q.lateral));
      const err = target - c.u;
      sim.input.throttleAxis = Math.max(0, Math.min(1, 0.5 * err));
      sim.input.brakeAxis = Math.max(0, Math.min(1, -0.3 * err));
      sim.step();
    }
    expect(sim.lap.last).not.toBeNull();
    expect(sim.lap.lastValid).toBe(true);
    // 5 km a ~110 km/h: circa 165 s
    expect(sim.lap.last!).toBeGreaterThan(150);
    expect(sim.lap.last!).toBeLessThan(185);
    expect(sim.lap.bestSplits.length).toBe(2);
  });
});
