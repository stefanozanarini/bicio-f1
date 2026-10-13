import { FL, FR, RL, RR, type Car } from './car.ts';
import { Surface, type Track, type TrackQuery } from './track.ts';

export interface LapState {
  /** 0 = giro di lancio (o prima della partenza), poi 1, 2, ... */
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

/**
 * Cronometraggio di un'auto: passaggi sul traguardo con istante interpolato,
 * intertempi, limiti della pista (quattro ruote oltre la linea bianca) e
 * distanza percorsa in gara.
 */
export class LapTracker {
  readonly state: LapState;
  /** Istante dell'ultimo passaggio sul traguardo [s] */
  lastCrossTime = 0;
  private lastS = 0;
  private hint = -1;
  private readonly sectorEnds: number[];
  private readonly q: TrackQuery = { index: 0, s: 0, lateral: 0, surface: Surface.Asphalt, offTrack: false };

  constructor(private readonly track: Track) {
    this.sectorEnds = [track.length / 3, (2 * track.length) / 3];
    this.state = {
      lap: 0,
      current: 0,
      currentValid: false,
      last: null,
      lastValid: false,
      best: null,
      splits: [],
      bestSplits: [],
      distance: 0,
      trackLength: track.length,
    };
  }

  /** Riallinea il tracker alla posizione dell'auto (dopo un riposizionamento). */
  sync(car: Car): void {
    this.track.query(car.x, car.y, this.hint, this.q);
    this.hint = this.q.index;
    this.lastS = this.q.s;
    this.state.distance = this.q.s;
    this.state.currentValid = false;
  }

  /** Distanza di gara: negativa prima del primo passaggio sul traguardo. */
  get progress(): number {
    const L = this.track.length;
    const s = this.state.distance;
    if (this.state.lap === 0) return s > L / 2 ? s - L : s;
    return (this.state.lap - 1) * L + s;
  }

  get trackIndex(): number {
    return this.hint;
  }

  /** Da chiamare dopo ogni passo di simulazione. Restituisce true se l'auto ha appena tagliato il traguardo. */
  update(car: Car, time: number, dt: number): boolean {
    const L = this.track.length;
    const q = this.track.query(car.x, car.y, this.hint, this.q);
    this.hint = q.index;
    const s = q.s;
    const prev = this.lastS;
    const lap = this.state;
    let crossed = false;

    const w = car.wheels;
    if (w[FL].offTrack && w[FR].offTrack && w[RL].offTrack && w[RR].offTrack) lap.currentValid = false;

    if (prev > L - 100 && s < 100) {
      const frac = (L - prev) / (L - prev + s);
      const crossTime = time - dt + frac * dt;
      if (lap.lap > 0) {
        const lapTime = crossTime - this.lastCrossTime;
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
      this.lastCrossTime = crossTime;
      crossed = true;
    } else if (prev < 100 && s > L - 100) {
      lap.currentValid = false;
    } else if (lap.lap > 0) {
      const k = lap.splits.length;
      if (k < this.sectorEnds.length) {
        const e = this.sectorEnds[k];
        if (prev < e && s >= e) {
          const frac = (e - prev) / (s - prev);
          lap.splits.push(time - dt + frac * dt - this.lastCrossTime);
        }
      }
    }
    lap.current = lap.lap > 0 ? time - this.lastCrossTime : 0;
    lap.distance = s;
    this.lastS = s;
    return crossed;
  }
}
