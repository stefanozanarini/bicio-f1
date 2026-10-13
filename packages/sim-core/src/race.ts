import { AiDriver, lcg, type AiSkill } from './ai.ts';
import { DrivingAssists } from './assists.ts';
import { Car, FL, FR, RL, RR } from './car.ts';
import { resolveCollisions } from './collisions.ts';
import {
  defaultAids,
  defaultKeyboardTuning,
  emptyInput,
  InputFilter,
  type Aids,
  type KeyboardTuning,
  type RawInput,
} from './controls.ts';
import { abs, atan, atan2, cos, sin, wrapAngle } from './dmath.ts';
import { LapTracker } from './laps.ts';
import { defaultCar2026, type CarParams } from './params.ts';
import { RacingLine } from './racingLine.ts';
import { DT, PHYSICS_HZ, TELEMETRY_HZ } from './sim.ts';
import { TelemetryRecorder, type TelemetrySample } from './telemetry.ts';
import { Surface, Track, type TrackDef, type TrackQuery } from './track.ts';

export type RacePhase = 'grid' | 'countdown' | 'racing' | 'finished';

export interface EntrantSpec {
  id: string;
  kind: 'human' | 'ai';
  skill?: AiSkill;
}

export interface RaceOptions {
  /** Giri di gara; 0 = prove libere (nessuna partenza, nessun arrivo) */
  laps: number;
  seed: number;
  aids?: Aids;
  keyboard?: KeyboardTuning;
  car?: CarParams;
  /** Prove libere: distanza dalla linea del traguardo a cui si parte [m] */
  practiceStartOffset?: number;
}

export interface Entrant {
  readonly index: number;
  readonly spec: EntrantSpec;
  readonly car: Car;
  readonly filter: InputFilter;
  readonly timing: LapTracker;
  readonly ai: AiDriver | null;
  input: RawInput;
  aids: Aids;
  keyboard: KeyboardTuning;
  finished: boolean;
  finishTime: number | null;
  /** Posizione in classifica (1 = primo) */
  position: number;
  /** Distacco dal primo [s] (giri di distacco in lapsBehind) */
  gap: number;
  lapsBehind: number;
  lastMark: number;
  readonly assists: DrivingAssists;
  /** Tempo trascorso fuori pista, girato o fermo fuori dalla carreggiata [s] */
  recoverTimer: number;
  /** Quante volte è stato rimesso in pista automaticamente */
  recoveries: number;
}

const AI_AIDS: Aids = {
  abs: true,
  tractionControl: true,
  autoShift: true,
  steerLimit: 0,
  stability: 0,
  brakingAssist: 0,
  forgivingGrass: false,
  autoRecover: false,
  steerAssist: 0,
};
/** Rientro automatico: secondi fuori pista, girati o fermi sull'erba prima di intervenire */
const RECOVER_AFTER = 2.5;
/** Velocità con cui si riparte dopo il rientro [m/s] */
const RECOVER_SPEED = 16;
/** Distanza tra i punti in cui si misurano i distacchi [m] */
const GAP_MARK = 25;
const TELEMETRY_EVERY = PHYSICS_HZ / TELEMETRY_HZ;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Una sessione in pista con più auto: prove libere o gara con partenza da fermo,
 * semaforo, contatti tra auto, giri, arrivo e classifica. Deterministica dato il seme.
 */
export class RaceSession {
  readonly track: Track;
  readonly line: RacingLine | null;
  readonly entrants: Entrant[] = [];
  readonly options: RaceOptions;
  readonly telemetry = new TelemetryRecorder(TELEMETRY_HZ * 60 * 10);
  phase: RacePhase;
  tick = 0;
  /** Luci rosse accese (0..5) durante la partenza */
  lights = 0;
  /** Istante in cui si spengono le luci (via!) [s] */
  readonly lightsOutAt: number;
  raceStartTime = 0;
  /** Ordine d'arrivo (indici degli iscritti) */
  readonly finishOrder: number[] = [];
  /** Istante in cui la sessione si chiude dopo l'arrivo del vincitore */
  private closeAt = Infinity;
  private readonly leaderMarks: number[] = [];
  private readonly q: TrackQuery = { index: 0, s: 0, lateral: 0, surface: Surface.Asphalt, offTrack: false };
  private readonly sample = {} as TelemetrySample;
  /** Iscritto di cui si registra la telemetria (il giocatore) */
  focus = 0;

  constructor(def: TrackDef, specs: EntrantSpec[], options: RaceOptions) {
    this.track = new Track(def);
    this.options = options;
    // Traiettoria ideale: serve ai piloti automatici e alla frenata assistita
    this.line = new RacingLine(this.track);
    const rng = lcg(options.seed);
    this.lightsOutAt = 6 + 0.2 + rng() * 2.6;
    specs.forEach((spec, index) => {
      const car = new Car(options.car ?? defaultCar2026());
      const ai = spec.kind === 'ai' && this.line ? new AiDriver(this.line, car, spec.skill!, Math.floor(rng() * 1e9)) : null;
      this.entrants.push({
        index,
        spec,
        car,
        filter: new InputFilter(),
        timing: new LapTracker(this.track),
        ai,
        input: emptyInput(),
        aids: ai ? AI_AIDS : (options.aids ?? defaultAids()),
        keyboard: options.keyboard ?? defaultKeyboardTuning(),
        finished: false,
        finishTime: null,
        position: index + 1,
        gap: 0,
        lapsBehind: 0,
        lastMark: -Infinity,
        assists: new DrivingAssists(ai ? null : this.line, car),
        recoverTimer: 0,
        recoveries: 0,
      });
    });
    const human = this.entrants.findIndex((e) => e.spec.kind === 'human');
    this.focus = human >= 0 ? human : 0;
    if (options.laps > 0) {
      this.phase = 'grid';
      this.entrants.forEach((e, k) => this.placeOnGrid(e, k));
    } else {
      this.phase = 'racing';
      this.entrants.forEach((e, k) => this.placeAt(e, -(options.practiceStartOffset ?? 120) - k * 30, 0));
    }
  }

  get time(): number {
    return this.tick * DT;
  }

  get isRace(): boolean {
    return this.options.laps > 0;
  }

  /** Griglia sfalsata: 8 m tra una posizione e l'altra, alternando i lati. */
  private placeOnGrid(e: Entrant, slot: number): void {
    this.placeAt(e, -10 - slot * 8, slot % 2 === 0 ? 2.6 : -2.6);
  }

  private placeAt(e: Entrant, s: number, lateral: number): void {
    const p = this.track.poseAt(s);
    e.car.place(p.x - sin(p.heading) * lateral, p.y + cos(p.heading) * lateral, p.heading);
    e.filter.reset();
    e.timing.sync(e.car);
    e.ai?.clearStuck();
  }

  /** Riporta in pista un iscritto (tasto R, rientro automatico o pilota bloccato): giro invalidato. */
  respawn(i: number, speed = 0): void {
    const e = this.entrants[i];
    this.track.query(e.car.x, e.car.y, e.timing.trackIndex, this.q);
    // Primo punto libero sulla linea centrale, arretrando di 12 m alla volta
    let s = this.q.s;
    for (let k = 0; k < 15; k++) {
      const p = this.track.poseAt(s);
      const free = this.entrants.every((o) => o === e || (o.car.x - p.x) * (o.car.x - p.x) + (o.car.y - p.y) * (o.car.y - p.y) > 14 * 14);
      if (free) break;
      s -= 12;
    }
    this.placeAt(e, s, 0);
    e.assists.reset();
    e.recoverTimer = 0;
    if (speed > 0) {
      e.car.u = speed;
      for (let w = 0; w < 4; w++) e.car.wheels[w].omega = speed / e.car.tireParams(w).radius;
    }
  }

  step(): void {
    const t = this.time;
    // --- Procedura di partenza
    if (this.phase === 'grid' && t >= 1) this.phase = 'countdown';
    if (this.phase === 'countdown') {
      this.lights = Math.min(5, Math.floor(t));
      if (t >= this.lightsOutAt) {
        this.phase = 'racing';
        this.lights = 0;
        this.raceStartTime = t;
      }
    }
    const racing = this.phase === 'racing' || this.phase === 'finished';

    // --- Comandi e dinamica
    for (const e of this.entrants) {
      let input = e.input;
      if (e.ai) {
        e.ai.cooldown = e.finished;
        input = e.ai.update(e.car, this.neighbors(e), DT, racing);
        if (e.ai.stuck) this.respawn(e.index);
      }
      const ctl = e.filter.update(input, e.keyboard, e.aids, e.car.params, e.car.speed, DT);
      if (!e.ai) e.assists.apply(ctl, e.car, e.aids);
      if (racing) {
        e.car.step(ctl, e.aids, this.track, DT);
      }
    }
    if (racing && this.entrants.length > 1) resolveCollisions(this.entrants.map((e) => e.car));
    if (this.entrants.length > 1) this.updateWake();

    this.tick++;
    const now = this.time;

    // --- Cronometraggio, arrivi, distacchi
    for (const e of this.entrants) {
      const crossed = e.timing.update(e.car, now, DT);
      if (crossed) e.ai?.newLap();
      if (crossed && this.isRace && !e.finished && racing && e.timing.state.lap > this.options.laps) {
        e.finished = true;
        e.finishTime = e.timing.lastCrossTime - this.raceStartTime;
        this.finishOrder.push(e.index);
        if (this.finishOrder.length === 1) this.closeAt = now + 90;
      }
      if (racing && !e.finished) this.updateGap(e, now);
      if (racing && !e.ai && e.aids.autoRecover) this.checkRecover(e);
    }
    if (this.isRace && this.phase === 'racing' && (this.finishOrder.length === this.entrants.length || now >= this.closeAt)) {
      this.phase = 'finished';
    }
    this.updatePositions();
    if (this.tick % TELEMETRY_EVERY === 0) this.recordTelemetry();
  }

  /**
   * Rientro automatico del giocatore: dopo qualche secondo con tutte le ruote sull'erba,
   * contromano o fermo fuori dalla carreggiata, l'auto torna in pista in un punto libero.
   */
  private checkRecover(e: Entrant): void {
    const c = e.car;
    const w = c.wheels;
    const onGrass = w.every((x) => x.surface === Surface.Grass);
    const anyOff = w.some((x) => x.offTrack);
    const i = e.timing.trackIndex;
    let wrongWay = false;
    if (i >= 0) {
      const err = wrapAngle(c.heading - atan2(this.track.ty[i], this.track.tx[i]));
      wrongWay = abs(err) > 1.75 && c.speed < 25;
    }
    const stopped = c.speed < 3 && anyOff;
    if (onGrass || wrongWay || stopped) e.recoverTimer += DT;
    else e.recoverTimer = Math.max(0, e.recoverTimer - 2 * DT);
    // Con la guida assistita si rientra prima
    if (e.recoverTimer > (e.aids.steerAssist > 0 ? RECOVER_AFTER * 0.6 : RECOVER_AFTER)) {
      e.recoveries++;
      this.respawn(e.index, RECOVER_SPEED);
    }
  }

  advance(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  /**
   * Scia e aria sporca: dietro un'altra auto (entro 60 m e quasi in linea) la
   * resistenza cala fino al 35% e il carico aerodinamico fino al 25%, di più da vicino.
   */
  private updateWake(): void {
    const L = this.track.length;
    const tr = this.track;
    for (const e of this.entrants) {
      let best = 0;
      let nearestAhead = Infinity;
      const i = e.timing.trackIndex;
      if (i >= 0) {
        const latE = (e.car.x - tr.px[i]) * -tr.ty[i] + (e.car.y - tr.py[i]) * tr.tx[i];
        for (const o of this.entrants) {
          if (o === e) continue;
          let ahead = o.timing.progress - e.timing.progress;
          ahead -= L * Math.round(ahead / L);
          if (ahead > 0 && ahead < nearestAhead && !o.finished) nearestAhead = ahead;
          if (ahead < 3 || ahead > 60) continue;
          const j = o.timing.trackIndex;
          if (j < 0) continue;
          const latO = (o.car.x - tr.px[j]) * -tr.ty[j] + (o.car.y - tr.py[j]) * tr.tx[j];
          const lat = Math.abs(latO - latE);
          if (lat > 2.2) continue;
          const f = (1 - ahead / 60) * (1 - lat / 2.2);
          if (f > best) best = f;
        }
      }
      e.car.wakeDrag = 1 - 0.35 * best;
      e.car.wakeDownforce = 1 - 0.25 * best;
      e.car.overtakeMode = this.isRace && this.phase === 'racing' && nearestAhead / Math.max(e.car.u, 10) < 1;
    }
  }

  /** Distacchi misurati quando ogni auto passa negli stessi punti in cui è passato il primo. */
  private updateGap(e: Entrant, now: number): void {
    const p = e.timing.progress;
    if (p < 0) return;
    const mark = Math.floor(p / GAP_MARK);
    if (mark === e.lastMark) return;
    e.lastMark = mark;
    if (this.leaderMarks[mark] === undefined) this.leaderMarks[mark] = now;
    e.gap = now - this.leaderMarks[mark];
  }

  private updatePositions(): void {
    const L = this.track.length;
    const order = this.entrants.slice().sort((a, b) => {
      if (a.finished && b.finished) return this.finishOrder.indexOf(a.index) - this.finishOrder.indexOf(b.index);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.timing.progress - a.timing.progress;
    });
    const leader = order[0];
    order.forEach((e, k) => {
      e.position = k + 1;
      e.lapsBehind = e === leader || e.finished ? 0 : Math.floor((leader.timing.progress - e.timing.progress) / L);
    });
  }

  /** Auto vicine viste da un pilota automatico (entro 60 m lungo la pista). */
  private neighbors(self: Entrant): { ahead: number; lateral: number; speed: number }[] {
    const out: { ahead: number; lateral: number; speed: number }[] = [];
    const line = this.line;
    if (!line) return out;
    const L = this.track.length;
    const me = self.timing.progress;
    for (const o of this.entrants) {
      if (o === self) continue;
      let ahead = o.timing.progress - me;
      // Su un giro di differenza conta la posizione fisica sulla pista
      ahead -= L * Math.round(ahead / L);
      if (ahead < -20 || ahead > 60) continue;
      const i = o.timing.trackIndex;
      if (i < 0) continue;
      const tr = this.track;
      const lat = (o.car.x - tr.px[i]) * -tr.ty[i] + (o.car.y - tr.py[i]) * tr.tx[i];
      out.push({ ahead, lateral: lat - line.offset[i], speed: o.car.u });
    }
    return out;
  }

  private recordTelemetry(): void {
    const e = this.entrants[this.focus];
    if (!e) return;
    const c = e.car;
    const w = c.wheels;
    const sm = this.sample;
    sm.time = this.time;
    sm.lap = e.timing.state.lap;
    sm.distance = e.timing.state.distance;
    sm.speed = c.u * 3.6;
    sm.rpm = c.engineRpm;
    sm.gear = c.gear;
    sm.throttle = e.filter.out.throttle;
    sm.brake = e.filter.out.brake;
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
