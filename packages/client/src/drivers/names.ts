/**
 * Generatore dei nomi dei piloti.
 *
 * Le basi dei nomi e l'elenco delle forme vietate stanno in `.private/piloti.json`,
 * escluso dal repository. Se il file manca (es. build da un clone pubblico) si usa
 * un elenco di nomi di fantasia neutri.
 */

export interface ForbiddenForm {
  len: number;
  hash: number;
}

export interface NamePool {
  nomi: string[];
  cognomi: string[];
  vietati: ForbiddenForm[];
}

const PUBLIC_POOL: NamePool = {
  nomi: ['Ivo', 'Leno', 'Mirco', 'Oreste', 'Sandro', 'Tullio', 'Dario', 'Ettore', 'Nello', 'Ugo'],
  cognomi: ['Rombani', 'Curvetti', 'Frenoli', 'Pistoni', 'Sgasi', 'Marmitta', 'Cordoli', 'Scia', 'Telaini', 'Spoiler'],
  vietati: [],
};

// Il glob restituisce un oggetto vuoto se il file privato non esiste: nessun errore di build
const privateFiles = import.meta.glob<{ default: NamePool }>('../../../../.private/piloti.json', { eager: true });
const privatePool = Object.values(privateFiles)[0]?.default;

export function namePool(): NamePool {
  return privatePool && privatePool.nomi?.length && privatePool.cognomi?.length ? privatePool : PUBLIC_POOL;
}

export function usingPrivatePool(): boolean {
  return namePool() !== PUBLIC_POOL;
}

/** Minuscole, senza accenti, solo lettere. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Hash FNV-1a a 32 bit. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Vero se il nome, normalizzato, contiene una delle forme vietate (confronto per hash). */
export function containsForbidden(name: string, forbidden: ForbiddenForm[]): boolean {
  const n = normalize(name);
  for (const f of forbidden) {
    for (let i = 0; i + f.len <= n.length; i++) {
      if (fnv1a(n.slice(i, i + f.len)) === f.hash) return true;
    }
  }
  return false;
}

export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rng = () => number;
const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

/** Piccole variazioni casuali: vocale cambiata o consonante raddoppiata. */
function vary(r: Rng, word: string): string {
  const x = r();
  if (x < 0.2) {
    const vowels = 'aeiou';
    const idx = [...word].map((c, i) => (vowels.includes(c) && i > 0 ? i : -1)).filter((i) => i >= 0);
    if (idx.length) {
      const i = pick(r, idx);
      return word.slice(0, i) + pick(r, [...vowels].filter((v) => v !== word[i])) + word.slice(i + 1);
    }
  } else if (x < 0.3) {
    const cons = [...word].map((c, i) => (i > 0 && i < word.length - 1 && /[bcdfglmnprstvz]/.test(c) && word[i + 1] !== c && word[i - 1] !== c ? i : -1)).filter((i) => i >= 0);
    if (cons.length) {
      const i = pick(r, cons);
      return word.slice(0, i + 1) + word[i] + word.slice(i + 1);
    }
  }
  return word;
}

export interface DriverName {
  full: string;
  /** Sigla di 3 lettere per classifiche e HUD */
  code: string;
}

export function generateName(r: Rng, pool: NamePool = namePool(), taken: Set<string> = new Set()): DriverName {
  for (let attempt = 0; attempt < 200; attempt++) {
    const first = vary(r, pick(r, pool.nomi));
    const last = vary(r, pick(r, pool.cognomi));
    const style = r();
    let full: string;
    if (style < 0.15) {
      // Iniziali puntate + cognome
      const second = pick(r, pool.nomi);
      full = `${first[0]}.${second[0]}. ${last}`;
    } else if (style < 0.3) {
      full = `${first[0]}. ${last}`;
    } else {
      full = `${first} ${last}`;
    }
    if (taken.has(full) || containsForbidden(full, pool.vietati)) continue;
    taken.add(full);
    const code = normalize(last).slice(0, 3).toUpperCase().padEnd(3, 'X');
    return { full, code };
  }
  throw new Error('Impossibile generare un nome valido: controllare il file dei nomi');
}
