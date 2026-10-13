import type { Aids, Controls } from './controls.ts';
import { abs, approach, clamp, cos, hypot, lerp, lowPass, max, min, sin, TAU } from './dmath.ts';
import type { CarParams, TireParams } from './params.ts';
import { engineTorque, ersDeployLimit, RADS_TO_RPM, RPM_TO_RADS } from './powertrain.ts';
import { computeTireForces, shapeB, type TireForces } from './tire.ts';
import { SURFACES, Surface, type Track, type TrackQuery } from './track.ts';

const G = 9.81;
const AIR_DENSITY = 1.225;
/** Velocità minima usata nel rilassamento delle gomme: smorza l'auto da ferma. */
const RELAX_MIN_SPEED = 0.8;
const MAX_SLIP = 3;

export const FL = 0;
export const FR = 1;
export const RL = 2;
export const RR = 3;

export interface WheelState {
  /** Velocità di rotazione [rad/s] */
  omega: number;
  /** Rapporto di slittamento longitudinale (con rilassamento) */
  kappa: number;
  /** tan dell'angolo di deriva (con rilassamento) */
  tanAlpha: number;
  /** Carico verticale [N] */
  fz: number;
  /** Forze della gomma nel riferimento ruota [N] */
  fx: number;
  fy: number;
  combinedSlip: number;
  /** Angolo di sterzata [rad] */
  steer: number;
  /** Angolo di rotazione (solo per il rendering) [rad] */
  spin: number;
  surface: Surface;
  offTrack: boolean;
  /** Slittamento misurato dalle velocità (come lo vede la centralina per TC e ABS) */
  measuredSlip: number;
  absFactor: number;
  trackHint: number;
}

function newWheel(): WheelState {
  return {
    omega: 0,
    kappa: 0,
    tanAlpha: 0,
    fz: 0,
    fx: 0,
    fy: 0,
    combinedSlip: 0,
    steer: 0,
    spin: 0,
    surface: Surface.Asphalt,
    offTrack: false,
    measuredSlip: 0,
    absFactor: 1,
    trackHint: -1,
  };
}

/**
 * Dinamica della vettura (fase 1).
 *
 * - Corpo rigido nel piano (avanzamento, deriva, imbardata).
 * - Trasferimenti di carico longitudinale e laterale con ritardo del primo ordine
 *   (in fase 2 sostituiti da sospensioni complete con beccheggio e rollio).
 * - 4 ruote con dinamica di rotazione propria, gomme Pacejka con rilassamento.
 * - Termico + MGU-K con batteria, cambio a 8 marce, differenziale autobloccante.
 * - Freni con ripartizione, recupero di energia in frenata.
 * - Aerodinamica attiva 2026: configurazione curva / rettilineo.
 */
export class Car {
  readonly params: CarParams;
  private readonly bFront: number;
  private readonly bRear: number;

  // Stato del corpo: posizione nel mondo, velocità nel riferimento vettura
  x = 0;
  y = 0;
  heading = 0;
  /** Velocità longitudinale [m/s] */
  u = 0;
  /** Velocità laterale, positiva a sinistra [m/s] */
  v = 0;
  /** Velocità d'imbardata, positiva in senso antiorario [rad/s] */
  r = 0;

  readonly wheels: WheelState[] = [newWheel(), newWheel(), newWheel(), newWheel()];

  /** -1 = retromarcia, 1..8 */
  gear = 1;
  shiftTimer = 0;
  engineRpm = 0;
  ersStore = 0;
  ersDeployPower = 0;
  ersHarvestPower = 0;
  /** 0 = configurazione curva, 1 = configurazione rettilineo */
  aeroBlend = 0;
  /** Accelerazioni filtrate nel riferimento vettura [m/s^2] */
  ax = 0;
  ay = 0;
  tcFactor = 1;
  downforce = 0;
  drag = 0;

  private readonly wx: number[];
  private readonly wy: number[];
  private readonly forces: TireForces = { fx: 0, fy: 0, combinedSlip: 0 };
  private readonly q: TrackQuery = { index: 0, s: 0, lateral: 0, surface: Surface.Asphalt, offTrack: false };
  private readonly brakeTq = [0, 0, 0, 0];
  private readonly driveTq = [0, 0, 0, 0];

  constructor(params: CarParams) {
    this.params = params;
    this.bFront = shapeB(params.tireFront.shapeC);
    this.bRear = shapeB(params.tireRear.shapeC);
    const c = params.chassis;
    const a = c.wheelbase * (1 - c.weightFront);
    const b = c.wheelbase * c.weightFront;
    this.wx = [a, a, -b, -b];
    this.wy = [c.trackFront / 2, -c.trackFront / 2, c.trackRear / 2, -c.trackRear / 2];
    this.ersStore = params.ers.storeCapacity;
  }

  get speed(): number {
    return hypot(this.u, this.v);
  }

  /** Posiziona l'auto ferma, in 1a marcia. */
  place(x: number, y: number, heading: number): void {
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.u = 0;
    this.v = 0;
    this.r = 0;
    this.ax = 0;
    this.ay = 0;
    this.gear = 1;
    this.shiftTimer = 0;
    this.tcFactor = 1;
    this.aeroBlend = 0;
    for (const w of this.wheels) {
      w.omega = 0;
      w.kappa = 0;
      w.tanAlpha = 0;
      w.fx = 0;
      w.fy = 0;
      w.absFactor = 1;
      w.trackHint = -1;
    }
  }

  tireParams(i: number): TireParams {
    return i < 2 ? this.params.tireFront : this.params.tireRear;
  }

  private gearRatio(): number {
    const gb = this.params.gearbox;
    return this.gear < 0 ? -gb.reverseRatio : gb.ratios[this.gear - 1];
  }

  private handleShifting(ctl: Controls, aids: Aids, rearOmega: number): void {
    const gb = this.params.gearbox;
    const eng = this.params.engine;
    if (this.shiftTimer > 0) return;
    let up = ctl.shiftUp;
    let down = ctl.shiftDown;
    if (aids.autoShift && this.gear > 0) {
      up = up || (this.engineRpm > 12000 && this.gear < 8);
      if (this.gear > 1) {
        const after = rearOmega * gb.ratios[this.gear - 2] * RADS_TO_RPM;
        down = down || after < 10800;
      }
    }
    if (up) {
      if (this.gear < 0) {
        if (this.u > -2) this.gear = 1;
      } else if (this.gear < gb.ratios.length) {
        this.gear++;
        this.shiftTimer = gb.shiftTime;
      }
    } else if (down) {
      if (this.gear === 1) {
        if (this.u < 1) this.gear = -1;
      } else if (this.gear > 1) {
        // Protezione dalle scalate: la centralina rifiuta la marcia se manderebbe fuori giri
        const after = rearOmega * gb.ratios[this.gear - 2] * RADS_TO_RPM;
        if (after < eng.limiterRpm + 300) {
          this.gear--;
          this.shiftTimer = gb.shiftTime;
        }
      }
    }
  }

  step(ctl: Controls, aids: Aids, track: Track, dt: number): void {
    const P = this.params;
    const ch = P.chassis;
    const m = ch.mass;
    const L = ch.wheelbase;
    const W = this.wheels;

    // --- Aerodinamica attiva: configurazione rettilineo a gas pieno, sterzo dritto, niente freno
    const wantStraight = ctl.throttle > 0.95 && ctl.brake < 0.01 && abs(ctl.steer) < 0.06 && this.u > 150 / 3.6;
    this.aeroBlend = approach(this.aeroBlend, wantStraight ? 1 : 0, wantStraight ? 2.5 : 5, dt);
    const clA = lerp(P.aero.clA, P.aero.clAStraight, this.aeroBlend);
    const cdA = lerp(P.aero.cdA, P.aero.cdAStraight, this.aeroBlend);
    const qd = 0.5 * AIR_DENSITY * this.u * this.u;
    this.downforce = clA * qd;
    this.drag = this.u >= 0 ? cdA * qd : -cdA * qd;

    // --- Carichi verticali
    const mg = m * G;
    const longT = (m * this.ax * ch.cgHeight + this.drag * P.aero.dragHeight) / L;
    const front = mg * ch.weightFront + this.downforce * P.aero.balanceFront - longT;
    const rear = mg * (1 - ch.weightFront) + this.downforce * (1 - P.aero.balanceFront) + longT;
    const latF = (ch.rollStiffnessFront * m * this.ay * ch.cgHeight) / ch.trackFront;
    const latR = ((1 - ch.rollStiffnessFront) * m * this.ay * ch.cgHeight) / ch.trackRear;
    W[FL].fz = max(0, front / 2 - latF);
    W[FR].fz = max(0, front / 2 + latF);
    W[RL].fz = max(0, rear / 2 - latR);
    W[RR].fz = max(0, rear / 2 + latR);

    // --- Sterzo
    const delta = ctl.steer * ch.maxSteerAngle;
    W[FL].steer = delta;
    W[FR].steer = delta;
    W[RL].steer = 0;
    W[RR].steer = 0;

    // --- Gomme: slittamenti e forze
    const ch0 = cos(this.heading);
    const sh0 = sin(this.heading);
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const tp = this.tireParams(i);
      const xi = this.wx[i];
      const yi = this.wy[i];
      const vxb = this.u - this.r * yi;
      const vyb = this.v + this.r * xi;
      const cd = cos(w.steer);
      const sd = sin(w.steer);
      const vxw = cd * vxb + sd * vyb;
      const vyw = -sd * vxb + cd * vyb;

      const gx = this.x + xi * ch0 - yi * sh0;
      const gy = this.y + xi * sh0 + yi * ch0;
      track.query(gx, gy, w.trackHint, this.q);
      w.trackHint = this.q.index;
      w.surface = this.q.surface;
      w.offTrack = this.q.offTrack;

      const avx = max(abs(vxw), RELAX_MIN_SPEED);
      const slipVel = w.omega * tp.radius - vxw;
      w.measuredSlip = slipVel / max(abs(vxw), 3);
      w.kappa = clamp((w.kappa + (dt * slipVel) / tp.relaxLong) / (1 + (dt * avx) / tp.relaxLong), -MAX_SLIP, MAX_SLIP);
      w.tanAlpha = clamp((w.tanAlpha - (dt * vyw) / tp.relaxLat) / (1 + (dt * avx) / tp.relaxLat), -MAX_SLIP, MAX_SLIP);

      computeTireForces(tp, i < 2 ? this.bFront : this.bRear, w.fz, w.kappa, w.tanAlpha, SURFACES[w.surface].mu, this.forces);
      w.fx = this.forces.fx;
      w.fy = this.forces.fy;
      w.combinedSlip = this.forces.combinedSlip;
    }

    // --- Cambio
    const rearOmega = (W[RL].omega + W[RR].omega) / 2;
    this.handleShifting(ctl, aids, rearOmega);
    if (this.shiftTimer > 0) this.shiftTimer = max(0, this.shiftTimer - dt);

    // --- Power unit
    const eng = P.engine;
    const ratio = this.gearRatio();
    const wheelRpm = rearOmega * ratio * RADS_TO_RPM;
    // Frizione automatica: slitta finché il regime dato dalle ruote non raggiunge quello di partenza
    const clutchRpm = eng.idleRpm + ctl.throttle * (eng.launchRpm - eng.idleRpm);
    const clutchEngaged = wheelRpm >= clutchRpm;
    let throttle = ctl.throttle;
    if (aids.tractionControl) {
      const k = max(W[RL].measuredSlip, W[RR].measuredSlip) * (this.gear < 0 ? -1 : 1);
      const target = P.tireRear.peakSlipRatio;
      const excess = (k - target) / target;
      const want = excess > 0 ? clamp(1 - 3 * excess, 0, 1) : 1;
      this.tcFactor = want < this.tcFactor ? lowPass(this.tcFactor, want, dt, 0.004) : lowPass(this.tcFactor, want, dt, 0.04);
      throttle *= this.tcFactor;
    } else {
      this.tcFactor = 1;
    }
    this.engineRpm = clutchEngaged ? wheelRpm : clutchRpm;
    let te = engineTorque(eng, this.engineRpm, throttle);
    if (!clutchEngaged) te = max(0, te);
    if (this.shiftTimer > 0) te = min(te, 0);

    // MGU-K: erogazione proporzionale al gas, limitata dalla velocità e dalla batteria.
    // Il limitatore di giri taglia anche la parte elettrica.
    let tk = 0;
    this.ersDeployPower = 0;
    if (throttle > 0 && this.gear > 0 && this.ersStore > 0 && this.shiftTimer <= 0 && this.engineRpm < eng.limiterRpm) {
      const pk = min(ersDeployLimit(P.ers, this.speed) * throttle, this.ersStore / dt);
      tk = pk / max(this.engineRpm * RPM_TO_RADS, 300);
      this.ersDeployPower = pk;
      this.ersStore -= pk * dt;
    }

    const tDrive = (te + tk) * ratio * P.gearbox.efficiency;
    const dw = W[RL].omega - W[RR].omega;
    const lockCap = P.diff.preload + P.diff.rampLock * abs(tDrive);
    const tLock = clamp(P.diff.stiffness * dw, -lockCap, lockCap);
    this.driveTq[FL] = 0;
    this.driveTq[FR] = 0;
    this.driveTq[RL] = tDrive / 2 - tLock;
    this.driveTq[RR] = tDrive / 2 + tLock;

    // --- Freni (con ABS opzionale) e recupero di energia
    const br = P.brakes;
    const total = ctl.brake * br.maxTorque;
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const share = i < 2 ? br.bias / 2 : (1 - br.bias) / 2;
      if (aids.abs && ctl.brake > 0) {
        const target = this.tireParams(i).peakSlipRatio;
        const excess = (-w.measuredSlip - target) / target;
        const want = excess > 0 ? clamp(1 - 3 * excess, 0.15, 1) : 1;
        w.absFactor = want < w.absFactor ? lowPass(w.absFactor, want, dt, 0.004) : lowPass(w.absFactor, want, dt, 0.03);
      } else {
        w.absFactor = 1;
      }
      this.brakeTq[i] = total * share * w.absFactor;
    }
    this.ersHarvestPower = 0;
    if (ctl.brake > 0 && this.ersStore < P.ers.storeCapacity) {
      // Brake-by-wire: il recupero sostituisce parte della frenata posteriore, la coppia totale resta uguale
      const p = min(P.ers.maxHarvestPower, (this.brakeTq[RL] + this.brakeTq[RR]) * abs(rearOmega));
      this.ersHarvestPower = p;
      this.ersStore = min(P.ers.storeCapacity, this.ersStore + p * P.ers.harvestEfficiency * dt);
    }

    // --- Rotazione delle ruote
    const engInertiaPerRear = clutchEngaged ? (eng.inertia * ratio * ratio) / 2 : 0;
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const tp = this.tireParams(i);
      const inertia = tp.inertia + (i >= 2 ? engInertiaPerRear : 0);
      w.omega += (dt * (this.driveTq[i] - w.fx * tp.radius)) / inertia;
      // Freno e resistenza al rotolamento portano la ruota verso zero senza mai invertirla
      const resist = this.brakeTq[i] + (tp.rollingRes + SURFACES[w.surface].extraRolling) * w.fz * tp.radius;
      const dOmega = (resist * dt) / inertia;
      if (w.omega > dOmega) w.omega -= dOmega;
      else if (w.omega < -dOmega) w.omega += dOmega;
      else w.omega = 0;
      w.spin = (w.spin + w.omega * dt) % TAU;
    }

    // --- Corpo vettura
    let fxb = -this.drag;
    let fyb = 0;
    let mz = 0;
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const cd = cos(w.steer);
      const sd = sin(w.steer);
      const bx = cd * w.fx - sd * w.fy;
      const by = sd * w.fx + cd * w.fy;
      fxb += bx;
      fyb += by;
      mz += this.wx[i] * by - this.wy[i] * bx;
    }
    // Resistenza aggiuntiva delle superfici fuori pista (erba, ghiaia)
    let extra = 0;
    for (let i = 0; i < 4; i++) extra += SURFACES[W[i].surface].extraRolling * W[i].fz * 0.5;
    if (this.u > 0.1) fxb -= extra;
    else if (this.u < -0.1) fxb += extra;

    const axb = fxb / m;
    const ayb = fyb / m;
    const u0 = this.u;
    const v0 = this.v;
    const r0 = this.r;
    this.u = u0 + dt * (axb + r0 * v0);
    this.v = v0 + dt * (ayb - r0 * u0);
    this.r = r0 + (dt * mz) / ch.yawInertia;

    this.heading += this.r * dt;
    if (this.heading > Math.PI) this.heading -= TAU;
    else if (this.heading < -Math.PI) this.heading += TAU;
    const c = cos(this.heading);
    const s = sin(this.heading);
    this.x += (this.u * c - this.v * s) * dt;
    this.y += (this.u * s + this.v * c) * dt;

    this.ax = lowPass(this.ax, axb, dt, ch.loadTransferTau);
    this.ay = lowPass(this.ay, ayb, dt, ch.loadTransferTau);
  }
}
