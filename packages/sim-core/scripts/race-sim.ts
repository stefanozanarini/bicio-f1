/**
 * Gara di prova tra piloti automatici: `npx tsx packages/sim-core/scripts/race-sim.ts [pista] [auto] [giri]`
 */
import { lcg, randomSkill } from '../src/ai.ts';
import { RaceSession, type EntrantSpec } from '../src/race.ts';
import { TRACKS } from '../src/tracks/index.ts';

const def = TRACKS[process.argv[2] ?? 'riviera'];
const n = Number(process.argv[3] ?? 10);
const laps = Number(process.argv[4] ?? 3);
const r = lcg(7);
const specs: EntrantSpec[] = Array.from({ length: n }, (_, i) => ({ id: `ai${i}`, kind: 'ai', skill: randomSkill(r, i % 3 === 0 ? 'difficile' : i % 3 === 1 ? 'medio' : 'facile') }));
const race = new RaceSession(def, specs, { laps, seed: 42 });
let respawns = 0;
const origRespawn = race.respawn.bind(race);
race.respawn = (i: number) => { respawns++; origRespawn(i); };
const t0 = performance.now();
let lastPhase = race.phase;
while (race.phase !== 'finished' && race.time < 60 * 20) {
  race.step();
  if (race.phase !== lastPhase) { console.log(`${race.time.toFixed(2)} s: ${race.phase}`); lastPhase = race.phase; }
}
const ms = performance.now() - t0;
console.log(`simulati ${race.time.toFixed(0)} s in ${(ms / 1000).toFixed(1)} s (${(race.time / (ms / 1000)).toFixed(0)}x tempo reale), riposizionamenti: ${respawns}`);
for (const e of race.entrants.slice().sort((a, b) => a.position - b.position)) {
  const sk = e.spec.skill!;
  console.log(`${String(e.position).padStart(2)}. ${e.spec.id.padEnd(5)} pace ${sk.pace.toFixed(3)}  ${e.finished ? `arrivo ${e.finishTime!.toFixed(3)} s` : `giro ${e.timing.state.lap}`}  miglior giro ${e.timing.state.best?.toFixed(3) ?? '-'}`);
}
