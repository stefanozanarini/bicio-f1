import { abs, approach, clamp, lerp, max, min } from './dmath.ts';
import type { CarParams } from './params.ts';

/**
 * Input "grezzo" del giocatore, così come arriva da tastiera o gamepad.
 * È questo che viene registrato nei replay e inviato al server in multiplayer:
 * il filtraggio avviene dentro la simulazione, a passo fisso, ed è quindi deterministico.
 */
export interface RawInput {
  steerLeft: boolean;
  steerRight: boolean;
  throttleKey: boolean;
  brakeKey: boolean;
  /** Tasto di dosaggio parziale (gas e freno ridotti) */
  partialKey: boolean;
  /** Assi analogici (gamepad/volante). steerAxis: -1 destra .. +1 sinistra */
  steerAxis: number;
  throttleAxis: number;
  brakeAxis: number;
  shiftUp: boolean;
  shiftDown: boolean;
}

export function emptyInput(): RawInput {
  return {
    steerLeft: false,
    steerRight: false,
    throttleKey: false,
    brakeKey: false,
    partialKey: false,
    steerAxis: 0,
    throttleAxis: 0,
    brakeAxis: 0,
    shiftUp: false,
    shiftDown: false,
  };
}

/** Aiuti alla guida, tutti disattivabili. */
export interface Aids {
  abs: boolean;
  tractionControl: boolean;
  autoShift: boolean;
  /**
   * Limitazione dello sterzo in funzione della velocità (0 = disattivata, 1 = piena).
   * Con la tastiera lo sterzo è tutto-o-niente: senza questo aiuto, a 300 km/h
   * un tasto premuto chiederebbe l'angolo massimo e l'auto andrebbe in testacoda.
   */
  steerLimit: number;
}

export function defaultAids(): Aids {
  return { abs: false, tractionControl: true, autoShift: false, steerLimit: 0.85 };
}

/** Velocità di risposta dei comandi da tastiera (unità di comando al secondo). */
export interface KeyboardTuning {
  steerRate: number;
  steerReturnRate: number;
  throttleRate: number;
  throttleRelease: number;
  brakeRate: number;
  brakeRelease: number;
  partialThrottle: number;
  partialBrake: number;
}

export function defaultKeyboardTuning(): KeyboardTuning {
  return {
    steerRate: 4.0,
    steerReturnRate: 6.0,
    throttleRate: 5.0,
    throttleRelease: 10.0,
    brakeRate: 7.0,
    brakeRelease: 12.0,
    partialThrottle: 0.5,
    partialBrake: 0.6,
  };
}

export interface Controls {
  /** Frazione dell'angolo massimo di sterzata, positiva a sinistra */
  steer: number;
  throttle: number;
  brake: number;
  shiftUp: boolean;
  shiftDown: boolean;
}

export class InputFilter {
  private kbSteer = 0;
  private kbThrottle = 0;
  private kbBrake = 0;
  private prevUp = false;
  private prevDown = false;
  readonly out: Controls = { steer: 0, throttle: 0, brake: 0, shiftUp: false, shiftDown: false };

  reset(): void {
    this.kbSteer = 0;
    this.kbThrottle = 0;
    this.kbBrake = 0;
    this.out.steer = 0;
    this.out.throttle = 0;
    this.out.brake = 0;
  }

  update(raw: RawInput, tuning: KeyboardTuning, aids: Aids, car: CarParams, speed: number, dt: number): Controls {
    // Tastiera: rampe di salita e discesa
    const steerTarget = (raw.steerLeft ? 1 : 0) - (raw.steerRight ? 1 : 0);
    const returning = steerTarget === 0 || steerTarget * this.kbSteer < 0;
    this.kbSteer = approach(this.kbSteer, steerTarget, returning ? tuning.steerReturnRate : tuning.steerRate, dt);

    const thrTarget = raw.throttleKey ? (raw.partialKey ? tuning.partialThrottle : 1) : 0;
    this.kbThrottle = approach(
      this.kbThrottle,
      thrTarget,
      thrTarget > this.kbThrottle ? tuning.throttleRate : tuning.throttleRelease,
      dt,
    );
    const brkTarget = raw.brakeKey ? (raw.partialKey ? tuning.partialBrake : 1) : 0;
    this.kbBrake = approach(this.kbBrake, brkTarget, brkTarget > this.kbBrake ? tuning.brakeRate : tuning.brakeRelease, dt);

    // Analogico: ha la precedenza quando è in uso
    const steer = abs(raw.steerAxis) > 0.001 ? clamp(raw.steerAxis, -1, 1) : this.kbSteer;
    const throttle = max(this.kbThrottle, clamp(raw.throttleAxis, 0, 1));
    const brake = max(this.kbBrake, clamp(raw.brakeAxis, 0, 1));

    const limit = lerp(1, steerLimitFraction(car, speed), clamp(aids.steerLimit, 0, 1));

    const o = this.out;
    o.steer = steer * limit;
    o.throttle = throttle;
    o.brake = brake;
    o.shiftUp = raw.shiftUp && !this.prevUp;
    o.shiftDown = raw.shiftDown && !this.prevDown;
    this.prevUp = raw.shiftUp;
    this.prevDown = raw.shiftDown;
    return o;
  }
}

/**
 * Frazione di sterzo utile alla velocità data: angolo geometrico per la massima
 * accelerazione laterale stimata (meccanica + aerodinamica) più un margine pari a
 * circa l'angolo di deriva di picco della gomma anteriore.
 */
export function steerLimitFraction(car: CarParams, speed: number): number {
  const g = 9.81;
  const m = car.chassis.mass;
  const mu = car.tireFront.mu0 * 0.95;
  const downforce = 0.5 * 1.225 * car.aero.clA * speed * speed;
  const aLat = mu * (g + downforce / m);
  const v2 = max(speed * speed, 1);
  const angle = (car.chassis.wheelbase * aLat) / v2 + car.tireFront.peakSlipAngle * 1.4;
  return min(1, angle / car.chassis.maxSteerAngle);
}
