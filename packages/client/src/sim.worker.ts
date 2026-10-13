/// <reference lib="webworker" />
/**
 * Worker della simulazione: fa girare sim-core a 500 Hz, indipendentemente dal
 * frame rate del rendering, e invia gli snapshot al thread principale.
 * Gestisce sia le prove libere sia le gare contro i piloti automatici.
 */
import { DEFAULT_TRACK_ID, DT, lcg, RaceSession, randomSkill, TRACKS, type EntrantSpec } from '@bicio/sim-core';
import type { CarPose, FromWorker, SessionConfig, Snapshot, ToWorker } from './protocol.ts';

/** Passi massimi per tick: se il worker resta indietro si rallenta invece di "saltare". */
const MAX_STEPS_PER_TICK = 40;
const POST_INTERVAL_MS = 1000 / 120;

let session: RaceSession | null = null;
let config: SessionConfig | null = null;
let paused = false;
let last = 0;
let acc = 0;
let lastPost = 0;
let telemetryCursor = 0;
let perfSteps = 0;
let perfBusy = 0;
let perfStart = 0;

const post = (msg: FromWorker) => postMessage(msg);

function createSession(c: SessionConfig): RaceSession {
  const def = TRACKS[c.trackId] ?? TRACKS[DEFAULT_TRACK_ID];
  const race = c.mode === 'race';
  const n = race ? c.opponents + 1 : 1;
  const slot = race ? Math.min(c.playerSlot, n - 1) : 0;
  const r = lcg(c.seed);
  const specs: EntrantSpec[] = [];
  for (let i = 0; i < n; i++) {
    specs.push(i === slot ? { id: 'player', kind: 'human' } : { id: `ai${i}`, kind: 'ai', skill: randomSkill(r, c.difficulty) });
  }
  return new RaceSession(def, specs, { laps: race ? c.laps : 0, seed: c.seed, aids: c.aids, keyboard: c.keyboard });
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'start':
      config = msg.config;
      session = createSession(config);
      telemetryCursor = 0;
      paused = false;
      last = performance.now();
      acc = 0;
      post({ type: 'ready', trackId: session.track.def.id });
      break;
    case 'input':
      if (session) session.entrants[session.focus].input = msg.input;
      break;
    case 'settings':
      if (session && config) {
        const me = session.entrants[session.focus];
        me.aids = msg.aids;
        me.keyboard = msg.keyboard;
        config = { ...config, aids: msg.aids, keyboard: msg.keyboard };
      }
      break;
    case 'pause':
      paused = msg.paused;
      last = performance.now();
      acc = 0;
      break;
    case 'reset':
      session?.respawn(session.focus);
      break;
    case 'restart':
      if (config) {
        session = createSession(config);
        telemetryCursor = 0;
      }
      break;
  }
};

function snapshot(s: RaceSession): Snapshot {
  const me = s.entrants[s.focus];
  const c = me.car;
  const cars: CarPose[] = s.entrants.map((e) => ({
    x: e.car.x,
    y: e.car.y,
    heading: e.car.heading,
    steer: e.car.wheels[0].steer,
    spin: [e.car.wheels[0].spin, e.car.wheels[1].spin, e.car.wheels[2].spin, e.car.wheels[3].spin],
    latG: e.car.ay / 9.81,
    longG: e.car.ax / 9.81,
    aeroBlend: e.car.aeroBlend,
    harvesting: e.car.ersHarvestPower > 0,
  }));
  return {
    simTime: s.time,
    x: c.x,
    y: c.y,
    heading: c.heading,
    speed: c.speed,
    u: c.u,
    v: c.v,
    rpm: c.engineRpm,
    gear: c.gear,
    throttle: me.filter.out.throttle,
    brake: me.filter.out.brake,
    steer: me.filter.out.steer,
    latG: c.ay / 9.81,
    longG: c.ax / 9.81,
    ersStore: c.ersStore,
    ersCapacity: c.params.ers.storeCapacity,
    ersDeploy: c.ersDeployPower,
    ersHarvest: c.ersHarvestPower,
    aeroBlend: c.aeroBlend,
    tcActive: c.tcFactor < 0.98,
    overtakeMode: c.overtakeMode,
    wheels: c.wheels.map((w) => ({
      steer: w.steer,
      spin: w.spin,
      slip: w.combinedSlip,
      fz: w.fz,
      surface: w.surface,
      offTrack: w.offTrack,
    })),
    lap: { ...me.timing.state, splits: me.timing.state.splits.slice(), bestSplits: me.timing.state.bestSplits.slice() },
    cars,
    race: {
      phase: s.phase,
      lights: s.lights,
      laps: s.options.laps,
      raceTime: s.phase === 'racing' || s.phase === 'finished' ? s.time - s.raceStartTime : 0,
      focus: s.focus,
      standings: s.entrants
        .map((e) => ({
          index: e.index,
          position: e.position,
          lap: e.timing.state.lap,
          gap: e.gap,
          lapsBehind: e.lapsBehind,
          finished: e.finished,
          finishTime: e.finishTime,
          best: e.timing.state.best,
        }))
        .sort((a, b) => a.position - b.position),
    },
  };
}

function tick() {
  const now = performance.now();
  if (session && !paused) {
    acc += (now - last) / 1000;
    let steps = Math.floor(acc / DT);
    if (steps > MAX_STEPS_PER_TICK) {
      steps = MAX_STEPS_PER_TICK;
      acc = 0;
    } else {
      acc -= steps * DT;
    }
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) session.step();
    perfBusy += performance.now() - t0;
    perfSteps += steps;

    if (now - lastPost >= POST_INTERVAL_MS) {
      lastPost = now;
      const tel = session.telemetry.read(telemetryCursor);
      telemetryCursor = tel.from + tel.samples.length;
      post({ type: 'snapshot', snap: snapshot(session), telemetry: tel.samples });
    }
  }
  last = now;
  if (now - perfStart > 1000) {
    const secs = (now - perfStart) / 1000;
    if (perfStart > 0) post({ type: 'perf', stepsPerSecond: perfSteps / secs, loadPercent: (perfBusy / (secs * 1000)) * 100 });
    perfStart = now;
    perfSteps = 0;
    perfBusy = 0;
  }
}

setInterval(tick, 2);
