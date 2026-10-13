import { clamp } from './dmath.ts';
import type { EngineParams, ErsParams } from './params.ts';

export const RPM_TO_RADS = (2 * 3.141592653589793) / 60;
export const RADS_TO_RPM = 60 / (2 * 3.141592653589793);

/** Coppia del termico a piena farfalla, interpolata linearmente sulla curva. */
export function engineFullTorque(p: EngineParams, rpm: number): number {
  const xs = p.torqueCurveRpm;
  const ys = p.torqueCurveNm;
  if (rpm <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (rpm >= xs[last]) return ys[last];
  for (let i = 1; i <= last; i++) {
    if (rpm <= xs[i]) {
      const t = (rpm - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
    }
  }
  return ys[last];
}

/** Coppia netta del termico: piena farfalla scalata dal gas, meno il freno motore. */
export function engineTorque(p: EngineParams, rpm: number, throttle: number): number {
  if (rpm >= p.limiterRpm) return -p.engineBrakeNm * (rpm / p.limiterRpm);
  const drive = engineFullTorque(p, rpm) * throttle;
  const braking = p.engineBrakeNm * (1 - throttle) * clamp(rpm / p.limiterRpm, 0, 1);
  return drive - braking;
}

/** Potenza MGU-K disponibile alla velocità data (riduzione alle alte velocità). */
export function ersDeployLimit(p: ErsParams, speed: number): number {
  if (speed <= p.taperStartSpeed) return p.maxDeployPower;
  if (speed >= p.taperEndSpeed) return 0;
  const t = (speed - p.taperStartSpeed) / (p.taperEndSpeed - p.taperStartSpeed);
  return p.maxDeployPower * (1 - t);
}
