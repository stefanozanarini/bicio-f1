/// <reference lib="webworker" />
/**
 * Worker della simulazione: fa girare sim-core a 500 Hz, indipendentemente dal
 * frame rate del rendering, e invia gli snapshot al thread principale.
 */
import { DT, Simulation, TEST_TRACK, type TrackDef } from '@bicio/sim-core';
import type { FromWorker, Snapshot, ToWorker } from './protocol.ts';

const TRACKS: Record<string, TrackDef> = { [TEST_TRACK.id]: TEST_TRACK };
/** Passi massimi per tick: se il worker resta indietro si rallenta invece di "saltare". */
const MAX_STEPS_PER_TICK = 40;
const POST_INTERVAL_MS = 1000 / 120;

let sim: Simulation | null = null;
let paused = false;
let last = 0;
let acc = 0;
let lastPost = 0;
let telemetryCursor = 0;
let perfSteps = 0;
let perfBusy = 0;
let perfStart = 0;

const post = (msg: FromWorker) => postMessage(msg);

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'start': {
      const def = TRACKS[msg.trackId] ?? TEST_TRACK;
      sim = new Simulation(def, { aids: msg.aids, keyboard: msg.keyboard });
      telemetryCursor = 0;
      paused = false;
      last = performance.now();
      acc = 0;
      post({ type: 'ready', trackId: def.id });
      break;
    }
    case 'input':
      if (sim) sim.input = msg.input;
      break;
    case 'settings':
      if (sim) {
        sim.aids = msg.aids;
        sim.keyboard = msg.keyboard;
      }
      break;
    case 'pause':
      paused = msg.paused;
      last = performance.now();
      acc = 0;
      break;
    case 'reset':
      sim?.resetToTrack();
      break;
    case 'restart':
      if (sim) {
        const { aids, keyboard } = sim;
        sim = new Simulation(sim.track.def, { aids, keyboard });
        telemetryCursor = 0;
      }
      break;
  }
};

function snapshot(s: Simulation): Snapshot {
  const c = s.car;
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
    throttle: s.filter.out.throttle,
    brake: s.filter.out.brake,
    steer: s.filter.out.steer,
    latG: c.ay / 9.81,
    longG: c.ax / 9.81,
    ersStore: c.ersStore,
    ersCapacity: c.params.ers.storeCapacity,
    ersDeploy: c.ersDeployPower,
    ersHarvest: c.ersHarvestPower,
    aeroBlend: c.aeroBlend,
    tcActive: c.tcFactor < 0.98,
    wheels: c.wheels.map((w) => ({
      steer: w.steer,
      spin: w.spin,
      slip: w.combinedSlip,
      fz: w.fz,
      surface: w.surface,
      offTrack: w.offTrack,
    })),
    lap: { ...s.lap, splits: s.lap.splits.slice(), bestSplits: s.lap.bestSplits.slice() },
  };
}

function tick() {
  const now = performance.now();
  if (sim && !paused) {
    acc += (now - last) / 1000;
    let steps = Math.floor(acc / DT);
    if (steps > MAX_STEPS_PER_TICK) {
      steps = MAX_STEPS_PER_TICK;
      acc = 0;
    } else {
      acc -= steps * DT;
    }
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) sim.step();
    perfBusy += performance.now() - t0;
    perfSteps += steps;

    if (now - lastPost >= POST_INTERVAL_MS) {
      lastPost = now;
      const tel = sim.telemetry.read(telemetryCursor);
      telemetryCursor = tel.from + tel.samples.length;
      post({ type: 'snapshot', snap: snapshot(sim), telemetry: tel.samples });
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
