import { Car, FL, FR, RL, RR } from './car.ts';
import {
  defaultAids,
  defaultKeyboardTuning,
  emptyInput,
  InputFilter,
  type Aids,
  type KeyboardTuning,
  type RawInput,
} from './controls.ts';
import { atan } from './dmath.ts';
import { defaultCar2026, type CarParams } from './params.ts';
import { Surface, Track, type TrackDef, type TrackQuery } from './track.ts';
import { TelemetryRecorder, type TelemetrySample } from './telemetry.ts';

/** Frequenza della fisica [Hz] */
export const PHYSICS_HZ = 500;
export const DT = 1 / PHYSICS_HZ;
/** Frequenza di registrazione della telemetria [Hz] */
export const TELEMETRY_HZ = 50;
const TELEMETRY_EVERY = PHYSICS_HZ / TELEMETRY_HZ;
const RAD_TO_DEG = 180 / Math.PI;

export interface LapState {
  /** 0 = giro di lancio, poi 1, 2, ... */
  lap: number;
  /** Tempo del giro in corso [s] */
  current: number;
  currentValid: boolean;
  last: number | null;
  lastValid: boolean;
  best: number | null;
  /** Intertempi del giro in corso (fine settore 1, fine settore 2) */
  splits: number[];
  bestSplits: number[];
  /** Distanza lungo la pista [m] */
  distance: number;
  trackLength: number;
}

export interface SimOptions {
  car?: CarParams;
  aids?: Aids;
  keyboard?: KeyboardTuning;
  /** Distanza di partenza dalla linea del traguardo [m] */
  startOffset?: number;
}

/**
 * Una sessione di guida: una pista, un'auto, il filtro dei comandi, il cronometraggio
 * e la telemetria. Avanza a passo fisso con step(); nessuna dipendenza dal tempo reale.
 */
export class Simulation {
  readonly track: Track;
  readonly car: Car;
  readonly filter = new InputFilter();
  readonly telemetry = new TelemetryRecorder(TELEMETRY_HZ * 60 * 10);
  aids: Aids;
  keyboard: KeyboardTuning;
  input: RawInput = emptyInput();
  tick = 0;

  readonly lap: LapState;
  private lapStartTime = 0;
  private lastS = 0;
  private centerHint = -1;
  private readonly cq: TrackQuery = { index: 0, s: 0, lateral: 0, surface: Surface.Asphalt, offTrack: false };
  private readonly sample = {} as TelemetrySample;
  private readonly sectorEnds: number[];

  constructor(trackDef: TrackDef, opts: SimOptions = {}) {
    this.track = new Track(trackDef);
    this.car = new Car(opts.car ?? defaultCar2026());
    this.aids = opts.aids ?? defaultAids();
    this.keyboard = opts.keyboard ?? defaultKeyboardTuning();
    this.sectorEnds = [this.track.length / 3, (2 * this.track.length) / 3];
    this.lap = {
      lap: 0,
      current: 0,
      currentValid: false,
      last: null,
      lastValid: false,
      best: null,
      splits: [],
      bestSplits: [],
      distance: 0,
      trackLength: this.track.length,
    };
    this.placeAt(-(opts.startOffset ?? 120));
  }

  get time(): number {
    return this.tick * DT;
  }

  /** Mette l'auto ferma sulla linea centrale alla distanza s. */
  placeAt(s: number): void {
    const pose = this.track.poseAt(s);
    this.car.place(pose.x, pose.y, pose.heading);
    this.filter.reset();
    this.centerHint = pose.index;
    this.track.query(pose.x, pose.y, this.centerHint, this.cq);
    this.lastS = this.cq.s;
    this.lap.currentValid = false;
  }

  /** Riporta l'auto in pista nel punto più vicino. Invalida il giro in corso. */
  resetToTrack(): void {
    this.track.query(this.car.x, this.car.y, this.centerHint, this.cq);
    this.placeAt(this.cq.s);
  }

  step(): void {
    const car = this.car;
    const ctl = this.filter.update(this.input, this.keyboard, this.aids, car.params, car.speed, DT);
    car.step(ctl, this.aids, this.track, DT);
    this.tick++;
    this.updateTiming();
    if (this.tick % TELEMETRY_EVERY === 0) this.recordTelemetry();
  }

  /** Avanza di n passi. */
  advance(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  private updateTiming(): void {
    const t = this.time;
    const L = this.track.length;
    const q = this.track.query(this.car.x, this.car.y, this.centerHint, this.cq);
    this.centerHint = q.index;
    const s = q.s;
    const prev = this.lastS;
    const lap = this.lap;

    // Limiti della pista: tutte e quattro le ruote oltre la linea bianca
    const w = this.car.wheels;
    if (w[FL].offTrack && w[FR].offTrack && w[RL].offTrack && w[RR].offTrack) lap.currentValid = false;

    if (prev > L - 100 && s < 100) {
      // Traguardo in avanti: istante interpolato tra i due passi
      const frac = (L - prev) / (L - prev + s);
      const crossTime = t - DT + frac * DT;
      if (lap.lap > 0) {
        const lapTime = crossTime - this.lapStartTime;
        lap.last = lapTime;
        lap.lastValid = lap.currentValid;
        if (lap.currentValid && (lap.best === null || lapTime < lap.best)) {
          lap.best = lapTime;
          lap.bestSplits = lap.splits.slice();
        }
      }
      lap.lap++;
      lap.splits = [];
      lap.currentValid = true;
      this.lapStartTime = crossTime;
    } else if (prev < 100 && s > L - 100) {
      // Traguardo all'indietro
      lap.currentValid = false;
    } else if (lap.lap > 0) {
      for (let k = lap.splits.length; k < this.sectorEnds.length; k++) {
        const e = this.sectorEnds[k];
        if (prev < e && s >= e) {
          const frac = (e - prev) / (s - prev);
          lap.splits.push(t - DT + frac * DT - this.lapStartTime);
        }
        break;
      }
    }
    lap.current = lap.lap > 0 ? t - this.lapStartTime : 0;
    lap.distance = s;
    this.lastS = s;
  }

  private recordTelemetry(): void {
    const c = this.car;
    const w = c.wheels;
    const sm = this.sample;
    sm.time = this.time;
    sm.lap = this.lap.lap;
    sm.distance = this.lap.distance;
    sm.speed = c.u * 3.6;
    sm.rpm = c.engineRpm;
    sm.gear = c.gear;
    sm.throttle = this.filter.out.throttle;
    sm.brake = this.filter.out.brake;
    sm.steer = w[FL].steer * RAD_TO_DEG;
    sm.latG = c.ay / 9.81;
    sm.longG = c.ax / 9.81;
    sm.slipRatioFL = w[FL].kappa;
    sm.slipRatioFR = w[FR].kappa;
    sm.slipRatioRL = w[RL].kappa;
    sm.slipRatioRR = w[RR].kappa;
    sm.slipAngleFL = atan(w[FL].tanAlpha) * RAD_TO_DEG;
    sm.slipAngleFR = atan(w[FR].tanAlpha) * RAD_TO_DEG;
    sm.slipAngleRL = atan(w[RL].tanAlpha) * RAD_TO_DEG;
    sm.slipAngleRR = atan(w[RR].tanAlpha) * RAD_TO_DEG;
    sm.loadFL = w[FL].fz;
    sm.loadFR = w[FR].fz;
    sm.loadRL = w[RL].fz;
    sm.loadRR = w[RR].fz;
    sm.ersStore = c.ersStore / 1e6;
    sm.aeroMode = c.aeroBlend;
    this.telemetry.push(sm);
  }
}
