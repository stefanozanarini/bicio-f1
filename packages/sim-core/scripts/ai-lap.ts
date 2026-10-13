/**
 * Prova del pilota automatico: `npx tsx packages/sim-core/scripts/ai-lap.ts [pista] [livello]`
 */
import { AiDriver, lcg, randomSkill, type Difficulty } from '../src/ai.ts';
import { defaultAids } from '../src/controls.ts';
import { RacingLine } from '../src/racingLine.ts';
import { DT, Simulation } from '../src/sim.ts';
import { TRACKS } from '../src/tracks/index.ts';

const def = TRACKS[process.argv[2] ?? 'riviera'];
const level = (process.argv[3] ?? 'difficile') as Difficulty;
const sim = new Simulation(def, { aids: { ...defaultAids(), abs: true, tractionControl: true, autoShift: true, steerLimit: 0 }, startOffset: 30 });
const t0 = performance.now();
const line = new RacingLine(sim.track);
console.log(`traiettoria calcolata in ${(performance.now() - t0).toFixed(0)} ms`);
const skill = { ...randomSkill(lcg(1), level), consistency: 1, mistakeRate: 0 };
const ai = new AiDriver(line, sim.car, skill, 1);
let offTicks = 0;
let maxKmh = 0;
const laps: string[] = [];
for (let i = 0; i < 500 * 60 * 6 && sim.lap.lap < 4; i++) {
  sim.input = ai.update(sim.car, [], DT, true);
  const before = sim.lap.lap;
  sim.step();
  if (sim.lap.lap !== before && sim.lap.last !== null) laps.push(`${sim.lap.last.toFixed(3)}${sim.lap.lastValid ? '' : '*'}`);
  if (sim.car.wheels.every((w) => w.offTrack)) offTicks++;
  maxKmh = Math.max(maxKmh, sim.car.u * 3.6);
  if (ai.stuck) { console.log('BLOCCATO a', sim.lap.distance.toFixed(0)); break; }
}
console.log(`${def.name} [${level}] giri: ${laps.join('  ')}  fuori pista: ${(offTicks * DT).toFixed(1)} s  vmax ${maxKmh.toFixed(0)} km/h`);
