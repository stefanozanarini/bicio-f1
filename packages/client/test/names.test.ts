import { describe, expect, it } from 'vitest';
import { generateGrid } from '../src/drivers/index.ts';
import { containsForbidden, fnv1a, generateName, normalize, seeded, type NamePool } from '../src/drivers/names.ts';

describe('generatore dei nomi', () => {
  // Forma vietata di prova, salvata solo come hash come nel file privato
  const forbidden = [{ len: 5, hash: fnv1a('pista') }];

  it('riconosce una forma vietata anche dentro una parola, con maiuscole e accenti', () => {
    expect(containsForbidden('Pìstarelli Rossi', forbidden)).toBe(true);
    expect(containsForbidden('Ugo Pistà', forbidden)).toBe(true);
    expect(containsForbidden('Ugo Pisto', forbidden)).toBe(false);
  });

  it('non genera mai nomi che contengono forme vietate', () => {
    const pool: NamePool = { nomi: ['Pista', 'Ugo', 'Ivo'], cognomi: ['Pistarelli', 'Rossi', 'Verdi'], vietati: forbidden };
    const r = seeded(1);
    for (let i = 0; i < 300; i++) {
      const n = generateName(r, pool);
      expect(containsForbidden(n.full, forbidden)).toBe(false);
    }
  });

  it('normalizza togliendo accenti e simboli', () => {
    expect(normalize("B.F. D'Àngelo")).toBe('bfdangelo');
  });

  it('griglia deterministica, nomi e numeri unici', () => {
    const a = generateGrid(7, 20);
    const b = generateGrid(7, 20);
    expect(a.map((d) => d.name.full)).toEqual(b.map((d) => d.name.full));
    expect(new Set(a.map((d) => d.name.full)).size).toBe(20);
    expect(new Set(a.map((d) => d.portrait.number)).size).toBe(20);
  });
});
