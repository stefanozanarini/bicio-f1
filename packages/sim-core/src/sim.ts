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
import { LapTracker, type LapState } from './laps.ts';
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
  readonly timing: LapTracker;
  private readonly cq: TrackQuery = { index: 0, s: 0, lateral: 0, surface: Surface.Asphalt, offTrack: false };
  private readonly sample = {} as TelemetrySample;

  constructor(trackDef: TrackDef, opts: SimOptions = {}) {
    this.track = new Track(trackDef);
    this.car = new Car(opts.car ?? defaultCar2026());
    this.aids = opts.aids ?? defaultAids();
    this.keyboard = opts.keyboard ?? defaultKeyboardTuning();
    this.timing = new LapTracker(this.track);
    this.lap = this.timing.state;
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
    this.timing.sync(this.car);
  }


  /** Riporta l'auto in pista nel punto più vicino. Invalida il giro in corso. */
  resetToTrack(): void {
    this.track.query(this.car.x, this.car.y, this.timing.trackIndex, this.cq);
    this.placeAt(this.cq.s);
  }

  step(): void {
    const car = this.car;
    const ctl = this.filter.update(this.input, this.keyboard, this.aids, car.params, car.speed, DT);
    car.step(ctl, this.aids, this.track, DT);
    this.tick++;
    this.timing.update(car, this.time, DT);
    if (this.tick % TELEMETRY_EVERY === 0) this.recordTelemetry();
  }

  /** Avanza di n passi. */
  advance(n: number): void {
    for (let i = 0; i < n; i++) this.step();
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
