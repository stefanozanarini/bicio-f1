import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Il determinismo della simulazione richiede che sim-core non usi funzioni di Math
 * il cui risultato può variare tra motori JavaScript, né fonti di tempo o casualità.
 */
const FORBIDDEN = /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot|random)\b|\bDate\.now\b|\bperformance\.now\b|\*\*/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('purezza di sim-core', () => {
  it('nessuna funzione non deterministica nei sorgenti', () => {
    const offenders: string[] = [];
    for (const f of files(join(__dirname, '../src'))) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const tr = line.trim();
          if (!tr.startsWith('*') && !tr.startsWith('/*') && !tr.startsWith('//') && FORBIDDEN.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
