import { describe, expect, it } from 'vitest';
import { aidsForLevel, lcg, randomSkill, RaceSession, Surface, TRACKS, type EntrantSpec } from '../src/index.ts';

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

describe('aiuti alla guida', () => {
  function onGrass(level: 'facile' | 'simulazione') {
    const race = new RaceSession(TRACKS['lido-di-savio'], [{ id: 'me', kind: 'human' }], { laps: 0, seed: 1, aids: aidsForLevel(level) });
    const me = race.entrants[0];
    // Auto ferma sull'erba, 40 m fuori dalla pista
    const p = race.track.poseAt(600);
    me.car.place(p.x - Math.sin(p.heading) * 40, p.y + Math.cos(p.heading) * 40, p.heading);
    race.advance(500 * 4);
    return me;
  }

  it('rientro automatico: dall\'erba si torna in pista in qualche secondo', () => {
    const me = onGrass('facile');
    expect(me.recoveries).toBe(1);
    expect(me.car.wheels.some((w) => w.surface !== Surface.Grass)).toBe(true);
  });

  it('senza rientro automatico l\'auto resta dov\'è', () => {
    const race = new RaceSession(TRACKS['lido-di-savio'], [{ id: 'me', kind: 'human' }], { laps: 0, seed: 1, aids: { ...aidsForLevel('simulazione'), autoRecover: false } });
    const me = race.entrants[0];
    const p = race.track.poseAt(600);
    me.car.place(p.x - Math.sin(p.heading) * 40, p.y + Math.cos(p.heading) * 40, p.heading);
    race.advance(500 * 4);
    expect(me.recoveries).toBe(0);
    expect(me.car.wheels.every((w) => w.surface === Surface.Grass)).toBe(true);
  });
});

describe('auto remote (multiplayer)', () => {
  it('stima la posizione tra un aggiornamento e l\'altro e la cronometra', () => {
    const specs: EntrantSpec[] = [
      { id: 'me', kind: 'human' },
      { id: 'amico', kind: 'remote' },
    ];
    const race = new RaceSession(TRACKS['lido-di-savio'], specs, { laps: 2, seed: 3 });
    race.advance(500 * 10);
    expect(race.phase).toBe('racing');
    const p = race.track.poseAt(-20);
    const st = { x: p.x, y: p.y, heading: p.heading, u: 50, v: 0, r: 0, steer: 0, spin: [0, 0, 0, 0] as [number, number, number, number], aero: 0, harvesting: false };
    race.setRemoteState(1, st, 0.1);
    // Proiettata in avanti di 0.1 s a 50 m/s: 5 m
    const c = race.entrants[1].car;
    expect(Math.hypot(c.x - p.x, c.y - p.y)).toBeCloseTo(5, 0);
    // Tra un aggiornamento e l'altro continua a muoversi e taglia il traguardo
    race.advance(500);
    expect(race.entrants[1].timing.state.lap).toBe(1);
  });

  it('un giocatore ritirato esce dai contatti e finisce in fondo alla classifica', () => {
    const specs: EntrantSpec[] = [
      { id: 'me', kind: 'human' },
      { id: 'amico', kind: 'remote' },
      { id: 'ai', kind: 'ai', skill: randomSkill(lcg(1), 'medio') },
    ];
    const race = new RaceSession(TRACKS['lido-di-savio'], specs, { laps: 1, seed: 3 });
    race.retire(1);
    race.advance(500 * 30);
    expect(race.entrants[1].retired).toBe(true);
    expect(race.entrants[1].position).toBe(3);
  });
});
