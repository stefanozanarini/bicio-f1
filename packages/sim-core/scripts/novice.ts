/**
 * Prova degli aiuti alla guida con un "pilota maldestro": gas sempre a fondo, mai il freno,
 * sterzo a scatti come con le frecce della tastiera.
 * `npx tsx packages/sim-core/scripts/novice.ts [pista]`
 */
import { aidsForLevel, type DrivingLevel } from '../src/controls.ts';
import { atan2, wrapAngle } from '../src/dmath.ts';
import { RaceSession } from '../src/race.ts';
import { Surface } from '../src/track.ts';
import { DT } from '../src/sim.ts';
import { TRACKS } from '../src/tracks/index.ts';

const def = TRACKS[process.argv[2] ?? 'lido-di-savio'];
for (const level of ['bicio', 'facile', 'medio', 'simulazione'] as DrivingLevel[]) {
  const race = new RaceSession(def, [{ id: 'me', kind: 'human' }], { laps: 0, seed: 1, aids: aidsForLevel(level) });
  const me = race.entrants[0];
  const tr = race.track;
  let grass = 0;
  let laps = 0;
  for (let i = 0; i < 500 * 300; i++) {
    const c = me.car;
    const idx = me.timing.trackIndex;
    const ahead = (idx + Math.floor((10 + c.u * 0.4) / tr.spacing)) % tr.count;
    const want = atan2(tr.py[ahead] - c.y, tr.px[ahead] - c.x);
    const err = wrapAngle(want - c.heading);
    me.input.throttleKey = true;
    me.input.steerLeft = err > 0.03;
    me.input.steerRight = err < -0.03;
    const before = me.timing.state.lap;
    race.step();
    if (me.timing.state.lap > before && before > 0) laps++;
    if (c.wheels.every((w) => w.surface === Surface.Grass)) grass += DT;
  }
  console.log(`${level.padEnd(12)} giri completati in 5 min: ${laps}  sull'erba: ${grass.toFixed(0)} s  rientri automatici: ${me.recoveries}  miglior giro: ${me.timing.state.best?.toFixed(1) ?? '-'}`);
}
