/**
 * Funzioni matematiche deterministiche.
 *
 * Le operazioni IEEE-754 di base (+ - * / e sqrt) danno lo stesso risultato su ogni
 * motore JavaScript, mentre Math.sin, Math.exp, Math.atan ecc. sono "implementation
 * approximated" e possono differire tra browser. Dentro sim-core si usano solo queste
 * versioni, così la stessa sequenza di input produce la stessa gara ovunque
 * (replay, validazione dei giri record, multiplayer). Un test vieta le funzioni di Math
 * non deterministiche nei sorgenti di sim-core.
 */

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
const QUARTER_PI = 0.7853981633974483;
const TAN_PI_8 = 0.41421356237309503;
const LN2 = 0.6931471805599453;

export const sqrt = Math.sqrt;
export const abs = Math.abs;
export const min = Math.min;
export const max = Math.max;
export const floor = Math.floor;
export const round = Math.round;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

export function hypot(x: number, y: number): number {
  return sqrt(x * x + y * y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Riporta un angolo in [-PI, PI]. */
export function wrapAngle(x: number): number {
  return x - TAU * round(x / TAU);
}

export function sin(x: number): number {
  let a = wrapAngle(x);
  if (a > HALF_PI) a = PI - a;
  else if (a < -HALF_PI) a = -PI - a;
  // Serie di Taylor fino a x^15 su [-PI/2, PI/2]: errore < 1e-11
  const a2 = a * a;
  let term = a;
  let sum = a;
  for (let n = 1; n <= 7; n++) {
    term *= -a2 / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

export function cos(x: number): number {
  return sin(x + HALF_PI);
}

export function tan(x: number): number {
  return sin(x) / cos(x);
}

function atanSmall(x: number): number {
  // |x| <= tan(PI/8): serie di Taylor fino a x^29, errore < 1e-12
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n <= 14; n++) {
    term *= -x2;
    sum += term / (2 * n + 1);
  }
  return sum;
}

export function atan(x: number): number {
  if (x !== x) return x;
  const neg = x < 0;
  let a = neg ? -x : x;
  let r: number;
  if (a > 1) {
    a = 1 / a;
    r = HALF_PI - atanUnit(a);
  } else {
    r = atanUnit(a);
  }
  return neg ? -r : r;
}

/** atan per a in [0, 1]. */
function atanUnit(a: number): number {
  if (a > TAN_PI_8) return QUARTER_PI + atanSmall((a - 1) / (a + 1));
  return atanSmall(a);
}

export function atan2(y: number, x: number): number {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

export function exp(x: number): number {
  if (x > 700) x = 700;
  if (x < -700) return 0;
  const k = round(x / LN2);
  const r = x - k * LN2;
  // |r| <= ln2/2: Taylor fino a r^14
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 14; n++) {
    term *= r / n;
    sum += term;
  }
  // Moltiplicazioni per 2 e 0.5 sono esatte
  if (k > 0) for (let i = 0; i < k; i++) sum *= 2;
  else for (let i = 0; i < -k; i++) sum *= 0.5;
  return sum;
}

/** Filtro passa-basso del primo ordine con costante di tempo tau. */
export function lowPass(prev: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target;
  return prev + (target - prev) * (dt / (tau + dt));
}

/** Avvicina value a target con velocità massima rate (unità al secondo). */
export function approach(value: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  if (value < target) return value + step > target ? target : value + step;
  return value - step < target ? target : value - step;
}
