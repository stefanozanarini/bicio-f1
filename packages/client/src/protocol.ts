import type { Aids, Difficulty, KeyboardTuning, LapState, RacePhase, RawInput, TelemetrySample } from '@bicio/sim-core';

/** Configurazione di una sessione in pista. */
export interface SessionConfig {
  mode: 'practice' | 'race';
  trackId: string;
  /** Giri di gara (ignorato nelle prove libere) */
  laps: number;
  opponents: number;
  difficulty: Difficulty;
  /** Posizione in griglia del giocatore (0 = pole) */
  playerSlot: number;
  seed: number;
  aids: Aids;
  keyboard: KeyboardTuning;
}

/** Messaggi dal thread principale al worker della simulazione. */
export type ToWorker =
  | { type: 'start'; config: SessionConfig }
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

/** Posa di un'auto per il rendering. */
export interface CarPose {
  x: number;
  y: number;
  heading: number;
  steer: number;
  spin: [number, number, number, number];
  latG: number;
  longG: number;
  aeroBlend: number;
  harvesting: boolean;
}

export interface StandingRow {
  index: number;
  position: number;
  lap: number;
  /** Distacco dal primo [s] */
  gap: number;
  lapsBehind: number;
  finished: boolean;
  finishTime: number | null;
  best: number | null;
}

export interface RaceInfo {
  phase: RacePhase;
  lights: number;
  laps: number;
  /** Tempo di gara dal via [s] */
  raceTime: number;
  standings: StandingRow[];
  focus: number;
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
  overtakeMode: boolean;
  wheels: WheelSnapshot[];
  lap: LapState;
  cars: CarPose[];
  race: RaceInfo;
}

export type FromWorker =
  | { type: 'ready'; trackId: string }
  | { type: 'snapshot'; snap: Snapshot; telemetry: TelemetrySample[] }
  | { type: 'perf'; stepsPerSecond: number; loadPercent: number };
