import { describe, expect, it } from 'vitest';
import { lcg, randomSkill, RaceSession, TRACKS, type EntrantSpec } from '../src/index.ts';

function field(n: number, seed = 3): EntrantSpec[] {
  const r = lcg(seed);
  return Array.from({ length: n }, (_, i) => ({ id: `ai${i}`, kind: 'ai' as const, skill: randomSkill(r, i % 2 ? 'medio' : 'difficile') }));
}

describe('gara con piloti automatici', () => {
  it('partenza: semaforo, poi via dopo 6-9 s', () => {
    const race = new RaceSession(TRACKS.riviera, field(4), { laps: 1, seed: 1 });
    expect(race.phase).toBe('grid');
    race.advance(500 * 3);
    expect(race.phase).toBe('countdown');
    expect(race.lights).toBeGreaterThan(0);
    // Durante la procedura le auto restano ferme
    expect(race.entrants.every((e) => e.car.speed < 0.01)).toBe(true);
    race.advance(500 * 6);
    expect(race.phase).toBe('racing');
    expect(race.lightsOutAt).toBeGreaterThan(6);
    expect(race.lightsOutAt).toBeLessThan(9);
  });

  it('una gara di 2 giri si chiude con tutti classificati, senza valori anomali', () => {
    const race = new RaceSession(TRACKS.riviera, field(6), { laps: 2, seed: 5 });
    while (race.phase !== 'finished' && race.time < 600) race.step();
    expect(race.phase).toBe('finished');
    expect(race.finishOrder.length).toBe(6);
    const positions = race.entrants.map((e) => e.position).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4, 5, 6]);
    for (const e of race.entrants) {
      expect(Number.isFinite(e.car.x) && Number.isFinite(e.car.u)).toBe(true);
      expect(e.finishTime).toBeGreaterThan(150);
    }
    // L'ordine d'arrivo rispetta i tempi
    const times = race.finishOrder.map((i) => race.entrants[i].finishTime!);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('deterministica: stesso seme, stessa gara', () => {
    const run = () => {
      const race = new RaceSession(TRACKS['bassa-pianura'], field(5, 9), { laps: 1, seed: 11 });
      race.advance(500 * 60);
      return race.entrants.map((e) => [e.car.x, e.car.y, e.car.u]);
    };
    expect(run()).toEqual(run());
  });
});
