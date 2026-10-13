import { generateName, seeded, type DriverName } from './names.ts';
import { randomPortrait, type PortraitParams } from './portrait.ts';

export interface Driver {
  id: string;
  name: DriverName;
  portrait: PortraitParams;
}

/** Griglia di piloti, deterministica a partire dal seme. Due piloti per team. */
export function generateGrid(seed: number, count: number): Driver[] {
  const r = seeded(seed);
  const taken = new Set<string>();
  const numbers = new Set<number>();
  const out: Driver[] = [];
  for (let i = 0; i < count; i++) {
    const name = generateName(r, undefined, taken);
    const portrait = randomPortrait(Math.floor(r() * 1e9), Math.floor(i / 2));
    while (numbers.has(portrait.number)) portrait.number = (portrait.number % 98) + 2;
    numbers.add(portrait.number);
    out.push({ id: `${seed}-${i}`, name, portrait });
  }
  return out;
}

export { portraitSvg } from './portrait.ts';
export { usingPrivatePool } from './names.ts';
