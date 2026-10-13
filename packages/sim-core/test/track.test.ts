import { describe, expect, it } from 'vitest';
import { Simulation, Surface, TEST_TRACK, Track, TRACKS } from '../src/index.ts';

describe('piste', () => {
  const t = new Track(TEST_TRACK);

  for (const def of Object.values(TRACKS)) {
    describe(def.name, () => {
      const tr = new Track(def);

      it('geometria sensata: lunghezza e raggio minimo', () => {
        expect(tr.length).toBeGreaterThan(4000);
        expect(tr.length).toBeLessThan(7000);
        let minR = Infinity;
        for (let i = 0; i < tr.count; i++) minR = Math.min(minR, 1 / Math.abs(tr.curvature[i]));
        expect(minR).toBeGreaterThan(15);
      });

      it('nessuna sovrapposizione tra parti lontane del tracciato', () => {
        let minD = Infinity;
        for (let i = 0; i < tr.count; i += 2)
          for (let j = i + 2; j < tr.count; j += 2) {
            const along = Math.min(j - i, tr.count - (j - i)) * tr.spacing;
            if (along < 150) continue;
            minD = Math.min(minD, Math.hypot(tr.px[i] - tr.px[j], tr.py[i] - tr.py[j]));
          }
        expect(minD).toBeGreaterThan(def.width * 3);
      });

      it('cronometraggio: un giro completo seguendo la linea centrale', () => {
        const sim = new Simulation(def, { startOffset: 20 });
        sim.aids.autoShift = true;
        sim.aids.abs = true;
        const q = { index: -1, s: 0, lateral: 0, surface: Surface.Asphalt, offTrack: false };
        // Pilota di prova: velocità adatta al raggio delle curve imminenti, sterzo su errore laterale e di direzione
        for (let i = 0; i < 500 * 400 && sim.lap.last === null; i++) {
          const c = sim.car;
          sim.track.query(c.x, c.y, q.index, q);
          let maxK = 0;
          for (let d = 0; d < 80; d += 4) maxK = Math.max(maxK, Math.abs(sim.track.curvature[(q.index + d / sim.track.spacing) % sim.track.count]));
          const target = Math.min(110 / 3.6, Math.sqrt((1.1 * 9.81) / Math.max(maxK, 1e-4)));
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
        expect(sim.lap.bestSplits.length).toBe(2);
      });
    });
  }

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

});
