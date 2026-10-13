import type { Aids, KeyboardTuning, LapState, RawInput, TelemetrySample } from '@bicio/sim-core';

/** Messaggi dal thread principale al worker della simulazione. */
export type ToWorker =
  | { type: 'start'; trackId: string; aids: Aids; keyboard: KeyboardTuning }
  | { type: 'input'; input: RawInput }
  | { type: 'settings'; aids: Aids; keyboard: KeyboardTuning }
  | { type: 'pause'; paused: boolean }
  | { type: 'reset' }
  | { type: 'restart' };

export interface WheelSnapshot {
  steer: number;
  spin: number;
  slip: number;
  fz: number;
  surface: number;
  offTrack: boolean;
}

/** Stato della simulazione inviato al renderer e all'HUD. */
export interface Snapshot {
  simTime: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  u: number;
  v: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  steer: number;
  latG: number;
  longG: number;
  ersStore: number;
  ersCapacity: number;
  ersDeploy: number;
  ersHarvest: number;
  aeroBlend: number;
  tcActive: boolean;
  wheels: WheelSnapshot[];
  lap: LapState;
}

export type FromWorker =
  | { type: 'ready'; trackId: string }
  | { type: 'snapshot'; snap: Snapshot; telemetry: TelemetrySample[] }
  | { type: 'perf'; stepsPerSecond: number; loadPercent: number };
