import type { Car } from './car.ts';
import { emptyInput, type RawInput } from './controls.ts';
import { abs, atan, clamp, cos, max, min, sin } from './dmath.ts';
import { speedProfile, type RacingLine } from './racingLine.ts';

/** Abilità di un pilota automatico. */
export interface AiSkill {
  /** Frazione dell'aderenza sfruttata in curva (0.85 = prudente, 0.99 = al limite) */
  pace: number;
  /** Frazione della frenata massima usata (staccate più o meno decise) */
  braking: number;
  /** 0..1: regolarità da un giro all'altro */
  consistency: number;
  /** 0..1: propensione a tentare il sorpasso */
  aggression: number;
  /** Probabilità di errore (staccata lunga) per ogni curva */
  mistakeRate: number;
}

export type Difficulty = 'facile' | 'medio' | 'difficile';

/** Generatore pseudo-casuale deterministico (stesso seme, stessa gara). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function randomSkill(r: () => number, level: Difficulty): AiSkill {
  const base = level === 'facile' ? 0.86 : level === 'medio' ? 0.91 : 0.95;
  const spread = level === 'difficile' ? 0.035 : 0.05;
  return {
    pace: base + r() * spread,
    braking: (level === 'facile' ? 0.82 : level === 'medio' ? 0.88 : 0.93) + r() * 0.06,
    consistency: 0.6 + r() * 0.4,
    aggression: 0.2 + r() * 0.8,
    mistakeRate: (level === 'facile' ? 0.03 : 0.015) * (0.3 + r()),
  };
}

/** Informazioni su un'altra auto in pista, viste dal pilota automatico. */
export interface Neighbor {
  /** Distanza lungo la traiettoria: positiva se l'altra auto è davanti [m] */
  ahead: number;
  /** Scostamento laterale dell'altra auto rispetto alla traiettoria [m] */
  lateral: number;
  speed: number;
}

/**
 * Pilota automatico: segue la traiettoria ideale con un inseguimento puro dello sterzo
 * e un profilo di velocità calcolato con la stessa fisica dell'auto. Usa gli stessi
 * comandi del giocatore (assi analogici) e quindi la stessa simulazione.
 */
export class AiDriver {
  readonly skill: AiSkill;
  readonly input: RawInput = emptyInput();
  private readonly line: RacingLine;
  private readonly profile: Float64Array;
  private readonly rng: () => number;
  private idx = -1;
  /** Scostamento laterale attuale e desiderato rispetto alla traiettoria (sorpassi) */
  private offset = 0;
  private offsetTarget = 0;
  private lapJitter = 1;
  /** Manovra di sorpasso in corso (decisione mantenuta fino al termine) */
  private passing = false;
  private mistakeTimer = 0;
  private lastCornerCheck = 0;
  private stuckTime = 0;

  constructor(line: RacingLine, car: Car, skill: AiSkill, seed: number) {
    this.line = line;
    this.skill = skill;
    this.rng = lcg(seed);
    this.profile = speedProfile(line, car.params, { gripFactor: skill.pace, brakeFactor: skill.braking });
  }

  get lineIndex(): number {
    return this.idx;
  }

  /** Nuovo giro: piccola variazione del passo secondo la regolarità del pilota. */
  newLap(): void {
    const sigma = (1 - this.skill.consistency) * 0.02;
    this.lapJitter = 1 + (this.rng() - 0.5) * 2 * sigma;
  }

  /** Il pilota è fermo da troppo tempo (testacoda, auto bloccata): va rimesso in pista. */
  get stuck(): boolean {
    return this.stuckTime > 4;
  }

  clearStuck(): void {
    this.stuckTime = 0;
    this.idx = -1;
  }

  /** Dopo la bandiera a scacchi: giro di rientro a passo ridotto */
  cooldown = false;

  update(car: Car, neighbors: readonly Neighbor[], dt: number, racing: boolean): RawInput {
    const line = this.line;
    const n = line.count;
    const sp = line.track.spacing;
    this.idx = line.nearest(car.x, car.y, this.idx);
    const u = max(car.u, 0);

    // --- Traffico: sorpasso solo con un rettilineo davanti, altrimenti in scia a distanza di sicurezza
    let speedCap = Infinity;
    const hw = line.track.halfWidth - 1.6;
    const selfLineOff = line.offset[this.idx];
    let straight = true;
    // Un sorpasso già avviato può arrivare fino alla staccata
    const clearAhead = this.passing ? 25 : 70;
    for (let k = 0; k < clearAhead / sp; k += 5) {
      if (abs(line.curvature[(this.idx + k) % n]) > 1 / 400) {
        straight = false;
        break;
      }
    }
    const safeGap = 4 + 0.12 * u;
    // Si esce dalla scia solo da vicino, dopo averne sfruttato l'aspirazione
    const pullOut = 10 + 0.25 * u;
    let passing = false;
    let wanted = 0;
    for (const nb of neighbors) {
      const latDiff = abs(nb.lateral - this.offset);
      if (nb.ahead > -7 && nb.ahead < 7 && latDiff < 3.6) {
        // Ruota a ruota: ognuno tiene il proprio lato; in curva cede chi è leggermente dietro
        const side = this.offset >= nb.lateral ? 1 : -1;
        wanted = clamp(nb.lateral + side * 3.4, -hw - selfLineOff, hw - selfLineOff);
        passing = true;
        // In curva cede chi è dietro, anche di poco: la regola è simmetrica, quindi
        // due auto affiancate non possono cedersi il passo a vicenda fino a fermarsi
        if (!straight && nb.ahead > 0) speedCap = min(speedCap, max(nb.speed - 1.5, u * 0.85));
      } else if (nb.ahead >= 7 && nb.ahead < 70) {
        if (latDiff < 2.6 || (this.passing && latDiff < 5.5)) {
          // Il sorpasso si tenta se si sta recuperando o se si potrebbe andare più forte
          const closing = u - nb.speed;
          const potential = this.profile[(this.idx + Math.floor(nb.ahead / sp)) % n] * this.lapJitter - nb.speed;
          if (straight && (this.passing || nb.ahead < pullOut) && (this.passing || closing > 0.5 - 0.5 * this.skill.aggression || potential > 3 - 2 * this.skill.aggression)) {
            if (this.passing) {
              wanted = this.offsetTarget;
            } else {
              // Esce dalla scia dal lato con più spazio
              const lineOff = line.offset[(this.idx + Math.floor(nb.ahead / sp)) % n];
              const side = nb.lateral + lineOff > 0 ? -1 : 1;
              wanted = clamp(nb.lateral + side * 3.4, -hw - lineOff, hw - lineOff);
            }
            passing = true;
          } else {
            speedCap = min(speedCap, nb.speed + (nb.ahead - safeGap) * 0.8);
          }
        } else if (!straight && latDiff < 5 && nb.ahead < 30) {
          // Sorpasso non completato prima della curva: si rientra in scia
          speedCap = min(speedCap, nb.speed + (nb.ahead - safeGap) * 0.8);
        }
      }
    }
    this.passing = passing;
    this.offsetTarget = passing ? wanted : 0;
    speedCap = max(speedCap, 0);
    this.offset += clamp(this.offsetTarget - this.offset, -2.5 * dt, 2.5 * dt);

    // --- Sterzo: inseguimento puro di un punto avanti sulla traiettoria
    const look = clamp(6 + u * 0.33, 7, 42);
    const ti = (this.idx + Math.floor(look / sp)) % n;
    // Lo scostamento non deve mai portare l'auto oltre il bordo, qui e nel punto inseguito
    for (const k of [this.idx, ti]) {
      const lo = -hw - line.offset[k];
      const hi = hw - line.offset[k];
      this.offset = clamp(this.offset, lo, hi);
      this.offsetTarget = clamp(this.offsetTarget, lo, hi);
    }
    const nx = -line.track.ty[ti];
    const ny = line.track.tx[ti];
    const tx = line.x[ti] + nx * this.offset;
    const ty = line.y[ti] + ny * this.offset;
    const c = cos(car.heading);
    const s = sin(car.heading);
    const dx = (tx - car.x) * c + (ty - car.y) * s;
    const dy = -(tx - car.x) * s + (ty - car.y) * c;
    const kCmd = (2 * dy) / max(dx * dx + dy * dy, 1);
    const wb = car.params.chassis.wheelbase;
    let delta = atan(wb * kCmd);
    // Smorzamento dell'imbardata: corregge sovrasterzo e sottosterzo
    delta -= 0.06 * (car.r - u * kCmd);
    this.input.steerAxis = clamp(delta / car.params.chassis.maxSteerAngle, -1, 1);

    // --- Velocità: profilo un po' più avanti (tempo di reazione) con le abilità del pilota
    const ahead = (this.idx + Math.floor((4 + u * 0.12) / sp)) % n;
    let pace = this.lapJitter;
    // Errori: ogni tanto una staccata troppo lunga in ingresso curva
    if (racing && this.mistakeTimer <= 0 && abs(line.curvature[ahead]) > 1 / 120 && this.lastCornerCheck <= 0) {
      if (this.rng() < this.skill.mistakeRate) this.mistakeTimer = 1.5;
      this.lastCornerCheck = 3;
    }
    if (this.mistakeTimer > 0) {
      this.mistakeTimer -= dt;
      pace *= 1.08;
    }
    if (this.lastCornerCheck > 0) this.lastCornerCheck -= dt;
    // Fuori dalla traiettoria ideale le curve sono più strette: si rallenta
    if (abs(line.curvature[ahead]) > 1 / 250) pace *= 1 - 0.07 * min(1, abs(this.offset) / 3);
    if (this.cooldown) pace *= 0.7;
    const target = min(this.profile[ahead] * pace, speedCap);
    const err = target - u;
    this.input.throttleAxis = err > 0 ? clamp(0.35 + err * 0.5, 0, 1) : clamp(1 + err * 0.8, 0, 1) * (err > -0.5 ? 1 : 0);
    this.input.brakeAxis = err < -0.8 ? clamp(-err * 0.3, 0, 1) : 0;

    if (!racing) {
      this.input.throttleAxis = 0;
      this.input.brakeAxis = 1;
      this.input.steerAxis = 0;
      this.stuckTime = 0;
    } else {
      this.stuckTime = u < 2 ? this.stuckTime + dt : 0;
    }
    return this.input;
  }
}
