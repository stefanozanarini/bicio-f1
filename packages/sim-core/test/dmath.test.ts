import { describe, expect, it } from 'vitest';
import { atan, atan2, cos, exp, sin, tan } from '../src/dmath.ts';

describe('dmath: accuratezza rispetto a Math', () => {
  const xs: number[] = [];
  for (let x = -50; x <= 50; x += 0.0137) xs.push(x);

  it('sin, cos, tan', () => {
    for (const x of xs) {
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(1e-9);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(1e-9);
      if (Math.abs(Math.cos(x)) > 0.05) expect(Math.abs(tan(x) - Math.tan(x))).toBeLessThan(1e-7);
    }
  });

  it('atan, atan2', () => {
    for (const x of xs) expect(Math.abs(atan(x) - Math.atan(x))).toBeLessThan(1e-11);
    for (let a = -3.1; a < 3.1; a += 0.01) {
      const y = Math.sin(a) * 3;
      const x = Math.cos(a) * 3;
      expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-11);
    }
  });

  it('exp', () => {
    for (let x = -30; x < 30; x += 0.01) {
      expect(Math.abs(exp(x) - Math.exp(x)) / Math.exp(x)).toBeLessThan(1e-12);
    }
  });
});
