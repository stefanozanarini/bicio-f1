/**
 * Ritratti caricaturali dei piloti a mezzo busto, disegnati in SVG.
 * Tutti i piloti condividono la stessa caricatura di base (testa grande, viso lungo,
 * ciuffo alzato, giacca chiara su camicia a fantasia); i parametri cambiano i dettagli.
 */
import { seeded } from './names.ts';

export interface PortraitParams {
  skin: string;
  hair: string;
  /** 0 = tempie piene, 1 = molto stempiato */
  recession: number;
  /** Altezza del ciuffo */
  quiff: number;
  /** Dimensione della testa rispetto al corpo (caricatura) */
  headScale: number;
  /** Allungamento del viso */
  faceLength: number;
  expression: 'smile' | 'grin' | 'smirk' | 'serious';
  browWeight: number;
  /** Sopracciglio alzato: -1 sinistro, 0 nessuno, 1 destro */
  browRaise: number;
  stubble: number;
  mustache: boolean;
  goatee: boolean;
  glasses: 'none' | 'round' | 'square' | 'shades';
  cap: boolean;
  jacket: string;
  shirtMotif: string;
  pocketSquare: boolean;
  primary: string;
  secondary: string;
  number: number;
}

const SKINS = ['#c99a74', '#bf8d66', '#d2a581', '#b5835c'];
const HAIRS = ['#231d1a', '#16130f', '#33291f', '#5e5a55'];
const JACKETS = ['#bdb5a8', '#c4baa9', '#aaa69f', '#b8ab95', '#9fa3a8'];
const MOTIFS = ['#3b3b55', '#7a2230', '#24466e', '#4a4038'];
const TEAM_COLORS: [string, string][] = [
  ['#1b2a6b', '#ff7a00'],
  ['#b0121b', '#f5c400'],
  ['#0d6e4f', '#e8e8e8'],
  ['#14141a', '#ff2d8a'],
  ['#e8e8ea', '#1f4fff'],
  ['#5b2a86', '#2ee6c8'],
  ['#ff6a00', '#1a1a1a'],
  ['#0a7cc4', '#ffd60a'],
  ['#3a3f47', '#ff3b30'],
  ['#7a1f2b', '#d9b26a'],
];

export function randomPortrait(seed: number, teamIndex?: number): PortraitParams {
  const r = seeded(seed * 7919 + 13);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const team = TEAM_COLORS[(teamIndex ?? Math.floor(r() * TEAM_COLORS.length)) % TEAM_COLORS.length];
  const g = r();
  const e = r();
  return {
    skin: pick(SKINS),
    hair: r() < 0.8 ? HAIRS[Math.floor(r() * 3)] : HAIRS[3],
    recession: 0.65 + r() * 0.35,
    quiff: 0.6 + r() * 0.6,
    headScale: 1.05 + r() * 0.13,
    faceLength: 0.94 + r() * 0.08,
    expression: e < 0.45 ? 'smile' : e < 0.7 ? 'grin' : e < 0.88 ? 'smirk' : 'serious',
    browWeight: 4.5 + r() * 2.5,
    browRaise: r() < 0.22 ? (r() < 0.5 ? -1 : 1) : 0,
    stubble: 0.12 + r() * 0.14,
    mustache: r() < 0.15,
    goatee: r() < 0.12,
    glasses: g < 0.1 ? 'round' : g < 0.2 ? 'square' : g < 0.28 ? 'shades' : 'none',
    cap: r() < 0.1,
    jacket: pick(JACKETS),
    shirtMotif: pick(MOTIFS),
    pocketSquare: r() < 0.5,
    primary: team[0],
    secondary: team[1],
    number: 2 + Math.floor(r() * 98),
  };
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

let uid = 0;

/** SVG del ritratto a mezzo busto (stringa), viewBox 200x240. */
export function portraitSvg(p: PortraitParams): string {
  const id = `p${uid++}`;
  const s = p.headScale;
  const cx = 100;
  const cy = 84;
  const rx = 42 * s;
  const ry = 45 * s * p.faceLength;
  const top = cy - ry;
  const chin = cy + ry;
  const skinDark = shade(p.skin, 0.8);
  const skinLight = shade(p.skin, 1.07);
  const jacketDark = shade(p.jacket, 0.8);
  const browColor = p.hair === HAIRS[3] ? '#3f3b37' : p.hair;
  const o: string[] = [];

  // Motivi riutilizzabili: trama della giacca e fantasia della camicia
  o.push(`<defs>
    <pattern id="${id}j" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${p.jacket}"/><path d="M0,1h6M0,4h6" stroke="${jacketDark}" stroke-width="0.6" opacity="0.35"/><path d="M2,0v6" stroke="#ffffff" stroke-width="0.5" opacity="0.15"/></pattern>
    <pattern id="${id}s" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#f6f4ef"/><path d="M2,3 q2,-2 4,0 q-2,2 -4,0z M8,9 q2,-2 4,0 q-2,2 -4,0z" fill="${p.shirtMotif}"/><circle cx="9" cy="3" r="0.9" fill="#b3262f"/><circle cx="3" cy="9" r="0.9" fill="#b3262f"/></pattern>
  </defs>`);

  // Sfondo con colori del team e numero
  o.push(`<rect width="200" height="240" rx="18" fill="${p.primary}"/>`);
  o.push(`<circle cx="100" cy="90" r="92" fill="#ffffff" opacity="0.08"/>`);
  o.push(`<text x="188" y="38" text-anchor="end" font-family="system-ui,sans-serif" font-weight="800" font-size="32" fill="${p.secondary}" opacity="0.9">${p.number}</text>`);

  // Busto: camicia, giacca con revers, colletto aperto
  const neckY = chin - 10;
  o.push(`<path d="M80,${neckY + 26} L100,232 L120,${neckY + 26} Z" fill="url(#${id}s)"/>`);
  o.push(`<path d="M6,240 C10,196 36,178 74,170 L100,240 Z" fill="url(#${id}j)" stroke="${jacketDark}" stroke-width="1.5"/>`);
  o.push(`<path d="M194,240 C190,196 164,178 126,170 L100,240 Z" fill="url(#${id}j)" stroke="${jacketDark}" stroke-width="1.5"/>`);
  // Revers
  o.push(`<path d="M74,170 L86,200 L78,206 L100,240 L68,190 Z" fill="${shade(p.jacket, 0.9)}" stroke="${jacketDark}" stroke-width="1.2"/>`);
  o.push(`<path d="M126,170 L114,200 L122,206 L100,240 L132,190 Z" fill="${shade(p.jacket, 0.9)}" stroke="${jacketDark}" stroke-width="1.2"/>`);
  // Collo
  o.push(`<path d="M${cx - 15},${neckY - 8} L${cx - 17},${neckY + 22} Q${cx},${neckY + 34} ${cx + 17},${neckY + 22} L${cx + 15},${neckY - 8} Z" fill="${skinDark}"/>`);
  // Colletto della camicia aperto
  o.push(`<path d="M${cx - 18},${neckY + 14} L${cx - 26},${neckY + 32} L${cx - 6},${neckY + 30} Z" fill="url(#${id}s)" stroke="#cfcac0" stroke-width="1"/>`);
  o.push(`<path d="M${cx + 18},${neckY + 14} L${cx + 26},${neckY + 32} L${cx + 6},${neckY + 30} Z" fill="url(#${id}s)" stroke="#cfcac0" stroke-width="1"/>`);
  // Spilla sul revers e fazzoletto nel taschino nei colori del team
  o.push(`<circle cx="77" cy="196" r="3.2" fill="${p.secondary}" stroke="${shade(p.secondary, 0.6)}" stroke-width="1"/>`);
  o.push(`<path d="M138,214 l22,-4" stroke="${jacketDark}" stroke-width="1.6"/>`);
  if (p.pocketSquare) o.push(`<path d="M140,213 l4,-9 l5,7 l5,-8 l4,8 Z" fill="${p.secondary}"/>`);

  // Orecchie
  for (const side of [-1, 1]) {
    o.push(`<ellipse cx="${cx + side * (rx + 2)}" cy="${cy + 4}" rx="7.5" ry="13" fill="${p.skin}" stroke="${skinDark}" stroke-width="1.8"/>`);
    o.push(`<path d="M${cx + side * (rx + 4)},${cy - 3} q${side * 3},6 0,12" stroke="${skinDark}" stroke-width="1.4" fill="none"/>`);
  }

  // Testa: calotta arrotondata, viso lungo, mascella marcata
  const head =
    `M${cx - rx},${cy - 6} C${cx - rx},${top - ry * 0.32} ${cx + rx},${top - ry * 0.32} ${cx + rx},${cy - 6} ` +
    `C${cx + rx},${cy + ry * 0.8} ${cx + rx * 0.75},${chin} ${cx},${chin} ` +
    `C${cx - rx * 0.75},${chin} ${cx - rx},${cy + ry * 0.8} ${cx - rx},${cy - 6} Z`;
  o.push(`<path d="${head}" fill="${p.skin}" stroke="${skinDark}" stroke-width="2"/>`);
  o.push(`<ellipse cx="${cx - 10}" cy="${top + 22}" rx="16" ry="9" fill="${skinLight}" opacity="0.55"/>`);

  // Barba di un giorno su mascella e labbro superiore
  o.push(
    `<path d="M${cx - rx + 3},${cy + 10} C${cx - rx + 4},${cy + ry * 0.8} ${cx - rx * 0.72},${chin - 1} ${cx},${chin - 1} C${cx + rx * 0.72},${chin - 1} ${cx + rx - 4},${cy + ry * 0.8} ${cx + rx - 3},${cy + 10} ` +
      `C${cx + 18},${cy + 26} ${cx - 18},${cy + 26} ${cx - rx + 3},${cy + 10} Z" fill="${p.hair}" opacity="${p.stubble.toFixed(2)}"/>`,
  );

  // Capelli: lati corti, ciuffo alzato col gel, tempie stempiate (oppure cappellino)
  if (p.cap) {
    o.push(`<path d="M${cx - rx - 3},${cy - 14} C${cx - rx},${top - 14} ${cx + rx},${top - 14} ${cx + rx + 3},${cy - 14} Z" fill="${p.primary}" stroke="${shade(p.primary, 0.65)}" stroke-width="2"/>`);
    o.push(`<path d="M${cx - rx + 2},${cy - 16} Q${cx + 10},${cy - 8} ${cx + rx + 28},${cy - 22} L${cx + rx + 26},${cy - 13} Q${cx + 10},${cy + 1} ${cx - rx + 2},${cy - 8} Z" fill="${p.secondary}"/>`);
    o.push(`<text x="${cx}" y="${cy - 30}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="18" fill="${p.secondary}">${p.number}</text>`);
  } else {
    // Lati rasati, appena sopra le orecchie
    for (const side of [-1, 1]) {
      const x0 = cx + side * rx;
      o.push(`<path d="M${x0 + side * 1},${cy - 6} C${x0 + side * 2},${cy - 26} ${x0 - side * 4},${top + 22} ${x0 - side * 12},${top + 14} L${x0 - side * 11},${top + 22} C${x0 - side * 5},${top + 30} ${x0 - side * 2},${cy - 22} ${x0 - side * 2},${cy - 6} Z" fill="${p.hair}" opacity="0.8"/>`);
    }
    // Attaccatura con le tempie che arretrano, ciuffo centrale a punte verso l'alto
    const temple = top + 20 - p.recession * 17;
    const front = top + 12;
    const h = 14 * p.quiff;
    const spikes: string[] = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = cx - 26 + t * 50;
      const base = top + 2 - Math.sin(t * Math.PI) * 4;
      const tip = base - h * (0.55 + 0.45 * Math.sin(t * Math.PI)) - (i % 2 ? 0 : 4);
      spikes.push(`${(x + 3).toFixed(1)},${tip.toFixed(1)} ${(x + 6).toFixed(1)},${(base - h * 0.35).toFixed(1)}`);
    }
    o.push(
      `<path d="M${cx - rx + 8},${temple + 6} C${cx - rx + 4},${top + 10} ${cx - 30},${top + 2} ${cx - 26},${top} L${spikes.join(' L')} ` +
        `L${cx + 28},${top} C${cx + 32},${top + 2} ${cx + rx - 4},${top + 10} ${cx + rx - 8},${temple + 6} ` +
        `C${cx + 22},${temple} ${cx + 18},${front + 6} ${cx + 8},${front + 2} Q${cx},${front + 6} ${cx - 8},${front + 2} C${cx - 18},${front + 6} ${cx - 22},${temple} ${cx - rx + 8},${temple + 6} Z" fill="${p.hair}"/>`,
    );
    o.push(`<path d="M${cx - 12},${top - 2} q8,-${(h * 0.8).toFixed(1)} 20,-${(h * 0.9).toFixed(1)}" stroke="#ffffff" stroke-width="1.6" opacity="0.18" fill="none"/>`);
  }

  // Sopracciglia scure, dritte e leggermente inclinate
  const browY = cy - 10;
  for (const side of [-1, 1]) {
    const raise = p.browRaise === side ? -6 : 0;
    const x1 = cx + side * 6;
    const x2 = cx + side * 28;
    o.push(`<path d="M${x1},${browY + 1 + raise} Q${(x1 + x2) / 2},${browY - 4 + raise} ${x2},${browY + 1 + raise}" stroke="${browColor}" stroke-width="${p.browWeight.toFixed(1)}" stroke-linecap="round" fill="none"/>`);
  }

  // Occhi a mandorla, aperti
  const eyeY = cy + 1;
  for (const side of [-1, 1]) {
    const ex = cx + side * 18;
    o.push(`<path d="M${ex - 9},${eyeY} Q${ex},${eyeY - 7} ${ex + 9},${eyeY} Q${ex},${eyeY + 4} ${ex - 9},${eyeY} Z" fill="#fbf8f2"/>`);
    o.push(`<circle cx="${ex - side * 0.5}" cy="${eyeY - 1}" r="3.7" fill="#2f1d10"/><circle cx="${ex - side * 0.5 + 1.1}" cy="${eyeY - 2.3}" r="1.1" fill="#fff"/>`);
    o.push(`<path d="M${ex - 10},${eyeY + 0.5} Q${ex},${eyeY - 8.5} ${ex + 10},${eyeY + 0.5}" stroke="#2a1d16" stroke-width="2.4" stroke-linecap="round" fill="none"/>`);
    o.push(`<path d="M${ex - 7},${eyeY + 5} Q${ex},${eyeY + 8} ${ex + 7},${eyeY + 5}" stroke="${skinDark}" stroke-width="1.3" fill="none"/>`);
  }

  if (p.glasses !== 'none') {
    const frame = p.glasses === 'shades' ? '#111' : '#2b2b2b';
    const fill = p.glasses === 'shades' ? '#1a1d24' : 'none';
    for (const side of [-1, 1]) {
      const ex = cx + side * 18;
      if (p.glasses === 'round') o.push(`<circle cx="${ex}" cy="${eyeY}" r="11.5" stroke="${frame}" stroke-width="2.6" fill="${fill}"/>`);
      else o.push(`<rect x="${ex - 13}" y="${eyeY - 9}" width="26" height="18" rx="4" stroke="${frame}" stroke-width="2.6" fill="${fill}" opacity="${p.glasses === 'shades' ? 0.93 : 1}"/>`);
    }
    o.push(`<path d="M${cx - 4},${eyeY - 2} Q${cx},${eyeY - 5} ${cx + 4},${eyeY - 2}" stroke="${frame}" stroke-width="2.6" fill="none"/>`);
  }

  // Naso lungo e dritto
  o.push(`<path d="M${cx - 1},${cy + 2} L${cx - 4},${cy + 22} C${cx - 10},${cy + 25} ${cx - 8},${cy + 31} ${cx - 2},${cy + 31} C${cx + 3},${cy + 33} ${cx + 9},${cy + 30} ${cx + 7},${cy + 25}" stroke="${skinDark}" stroke-width="2.2" fill="${skinLight}" stroke-linecap="round"/>`);
  o.push(`<ellipse cx="${cx - 4}" cy="${cy + 30}" rx="2.4" ry="1.3" fill="${skinDark}"/><ellipse cx="${cx + 4}" cy="${cy + 30}" rx="2.4" ry="1.3" fill="${skinDark}"/>`);

  // Bocca
  const my = cy + 40 * p.faceLength;
  const w = 19;
  o.push(`<path d="M${cx - w - 5},${my - 12} Q${cx - w - 8},${my - 3} ${cx - w - 2},${my + 3} M${cx + w + 5},${my - 12} Q${cx + w + 8},${my - 3} ${cx + w + 2},${my + 3}" stroke="${skinDark}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.8"/>`);
  if (p.expression === 'grin') {
    o.push(`<path d="M${cx - w},${my - 3} Q${cx},${my + 3} ${cx + w},${my - 3} Q${cx},${my + 17} ${cx - w},${my - 3} Z" fill="#5c1a1d"/>`);
    o.push(`<path d="M${cx - w + 3},${my - 1.5} Q${cx},${my + 4} ${cx + w - 3},${my - 1.5} Q${cx},${my + 9} ${cx - w + 3},${my - 1.5} Z" fill="#fbfaf5"/>`);
  } else if (p.expression === 'smirk') {
    o.push(`<path d="M${cx - w + 2},${my} Q${cx},${my + 4} ${cx + w},${my - 5}" stroke="#6b2a2a" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
  } else if (p.expression === 'serious') {
    o.push(`<path d="M${cx - w + 3},${my} Q${cx},${my + 2} ${cx + w - 3},${my}" stroke="#6b2a2a" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
  } else {
    o.push(`<path d="M${cx - w},${my - 3} Q${cx},${my + 6} ${cx + w},${my - 3}" stroke="#6b2a2a" stroke-width="2.8" fill="none" stroke-linecap="round"/>`);
  }
  o.push(`<path d="M${cx - 8},${my + 8} Q${cx},${my + 11} ${cx + 8},${my + 8}" stroke="${skinDark}" stroke-width="1.2" fill="none" opacity="0.6"/>`);

  if (p.mustache) o.push(`<path d="M${cx - w},${my - 5} Q${cx - 10},${my - 14} ${cx},${my - 8} Q${cx + 10},${my - 14} ${cx + w},${my - 5} Q${cx},${my - 6} ${cx - w},${my - 5} Z" fill="${p.hair}"/>`);
  if (p.goatee) o.push(`<path d="M${cx - 10},${my + 10} Q${cx},${chin + 4} ${cx + 10},${my + 10} Q${cx},${my + 15} ${cx - 10},${my + 10} Z" fill="${p.hair}"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240">${o.join('')}</svg>`;
}
