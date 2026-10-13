/**
 * Ritratti caricaturali dei piloti, disegnati in SVG.
 * Tutti i piloti condividono la stessa caricatura di base; i parametri ne cambiano
 * dettagli (capelli, barba, occhiali, espressione, abbigliamento, colori).
 */
import { seeded } from './names.ts';

export interface PortraitParams {
  skin: string;
  hair: string;
  /** 0 = attaccatura piena, 1 = molto stempiato */
  recession: number;
  /** Dimensione della testa (caricatura: testa grande) */
  headScale: number;
  /** Larghezza del sorriso */
  grin: number;
  browWeight: number;
  /** Sopracciglio alzato: -1 sinistro, 0 nessuno, 1 destro */
  browRaise: number;
  stubble: boolean;
  mustache: boolean;
  goatee: boolean;
  glasses: 'none' | 'round' | 'square' | 'shades';
  cap: boolean;
  outfit: 'suit' | 'blazer';
  primary: string;
  secondary: string;
  background: string;
  number: number;
}

const SKINS = ['#c8946b', '#bd875f', '#d3a07a', '#b07a52'];
const HAIRS = ['#2b2420', '#1c1917', '#3b2f28', '#6e6a66'];
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
  const team = TEAM_COLORS[(teamIndex ?? Math.floor(r() * TEAM_COLORS.length)) % TEAM_COLORS.length];
  const glassesRoll = r();
  return {
    skin: SKINS[Math.floor(r() * SKINS.length)],
    hair: HAIRS[Math.floor(r() * HAIRS.length)],
    recession: 0.55 + r() * 0.45,
    headScale: 1 + r() * 0.12,
    grin: 0.85 + r() * 0.35,
    browWeight: 5 + r() * 3,
    browRaise: r() < 0.25 ? (r() < 0.5 ? -1 : 1) : 0,
    stubble: r() < 0.55,
    mustache: r() < 0.22,
    goatee: r() < 0.15,
    glasses: glassesRoll < 0.12 ? 'round' : glassesRoll < 0.22 ? 'square' : glassesRoll < 0.3 ? 'shades' : 'none',
    cap: r() < 0.18,
    outfit: r() < 0.3 ? 'blazer' : 'suit',
    primary: team[0],
    secondary: team[1],
    background: team[0],
    number: 2 + Math.floor(r() * 98),
  };
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** SVG del ritratto (stringa), viewBox 200x220. */
export function portraitSvg(p: PortraitParams): string {
  const s = p.headScale;
  const cx = 100;
  const cy = 100;
  const rx = 48 * s;
  const ry = 64 * s;
  const top = cy - ry;
  const skinDark = shade(p.skin, 0.78);
  const skinLight = shade(p.skin, 1.08);
  const parts: string[] = [];

  // Sfondo
  parts.push(`<rect width="200" height="220" rx="18" fill="${p.background}"/>`);
  parts.push(`<circle cx="100" cy="95" r="88" fill="#ffffff" opacity="0.08"/>`);
  parts.push(`<text x="186" y="40" text-anchor="end" font-family="system-ui,sans-serif" font-weight="800" font-size="34" fill="${p.secondary}" opacity="0.85">${p.number}</text>`);

  // Spalle e abbigliamento
  if (p.outfit === 'suit') {
    parts.push(`<path d="M8,220 C14,186 48,170 80,166 L120,166 C152,170 186,186 192,220 Z" fill="${p.primary}" stroke="${shade(p.primary, 0.7)}" stroke-width="2"/>`);
    parts.push(`<path d="M30,200 C60,186 140,186 170,200 L172,210 C140,196 60,196 28,210 Z" fill="${p.secondary}"/>`);
    parts.push(`<path d="M80,166 L86,184 L100,188 L114,184 L120,166 Z" fill="${shade(p.primary, 0.75)}"/>`);
  } else {
    // Giacca chiara su camicia scura
    parts.push(`<path d="M8,220 C14,186 48,170 80,166 L120,166 C152,170 186,186 192,220 Z" fill="#c9a27a" stroke="#9c7a56" stroke-width="2"/>`);
    parts.push(`<path d="M82,166 L100,220 L118,166 Z" fill="#4a3a30"/>`);
    parts.push(`<path d="M80,166 L94,206 L86,176 Z M120,166 L106,206 L114,176 Z" fill="#b48d66"/>`);
  }

  // Collo e orecchie
  parts.push(`<rect x="84" y="${cy + ry - 22}" width="32" height="${190 - (cy + ry - 22)}" rx="10" fill="${skinDark}"/>`);
  for (const side of [-1, 1]) {
    parts.push(`<ellipse cx="${cx + side * (rx + 3)}" cy="${cy + 8}" rx="9" ry="14" fill="${p.skin}" stroke="${skinDark}" stroke-width="2"/>`);
  }

  // Testa
  parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${p.skin}" stroke="${skinDark}" stroke-width="2"/>`);
  parts.push(`<ellipse cx="${cx - 12}" cy="${top + 26}" rx="20" ry="12" fill="${skinLight}" opacity="0.6"/>`);

  // Barba di qualche giorno
  if (p.stubble) {
    parts.push(`<path d="M${cx - rx + 8},${cy + 12} C${cx - rx + 10},${cy + ry - 4} ${cx + rx - 10},${cy + ry - 4} ${cx + rx - 8},${cy + 12} C${cx + 20},${cy + 30} ${cx - 20},${cy + 30} ${cx - rx + 8},${cy + 12} Z" fill="${p.hair}" opacity="0.16"/>`);
  }

  // Capelli cortissimi con stempiatura, oppure cappellino
  if (p.cap) {
    parts.push(`<path d="M${cx - rx - 2},${cy - 8} C${cx - rx},${top - 8} ${cx + rx},${top - 8} ${cx + rx + 2},${cy - 8} Z" fill="${p.primary}" stroke="${shade(p.primary, 0.7)}" stroke-width="2"/>`);
    parts.push(`<path d="M${cx - rx + 4},${cy - 10} Q${cx},${cy - 2} ${cx + rx + 26},${cy - 14} L${cx + rx + 24},${cy - 6} Q${cx},${cy + 6} ${cx - rx + 4},${cy - 2} Z" fill="${p.secondary}"/>`);
    parts.push(`<text x="${cx}" y="${cy - 30}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="20" fill="${p.secondary}">${p.number}</text>`);
  } else {
    // Le "punte" dell'attaccatura salgono con la stempiatura, il ciuffo centrale resta più basso
    const corner = top + 30 - p.recession * 16;
    const centerY = top + 6 + (1 - p.recession) * 5;
    parts.push(
      `<path d="M${cx - rx},${cy + 6} C${cx - rx - 4},${cy - 40} ${cx - 30},${top - 3} ${cx},${top - 3} C${cx + 30},${top - 3} ${cx + rx + 4},${cy - 40} ${cx + rx},${cy + 6} ` +
        `L${cx + rx - 6},${cy + 4} C${cx + rx - 8},${cy - 16} ${cx + rx - 12},${corner + 10} ${cx + 26},${corner} ` +
        `Q${cx + 14},${centerY + 6} ${cx},${centerY} Q${cx - 14},${centerY + 6} ${cx - 26},${corner} ` +
        `C${cx - rx + 12},${corner + 10} ${cx - rx + 8},${cy - 16} ${cx - rx + 6},${cy + 4} Z" fill="${p.hair}"/>`,
    );
  }

  // Sopracciglia folte e scure
  const browY = cy - 6;
  for (const side of [-1, 1]) {
    const raise = p.browRaise === side ? -7 : 0;
    const x1 = cx + side * 10;
    const x2 = cx + side * 34;
    parts.push(`<path d="M${x1},${browY + 1 + raise} Q${(x1 + x2) / 2},${browY - 5 + raise} ${x2},${browY + 2 + raise}" stroke="${p.hair === '#6e6a66' ? '#4a4642' : p.hair}" stroke-width="${p.browWeight}" stroke-linecap="round" fill="none"/>`);
  }

  // Occhi aperti e sorridenti, con le rughe d'espressione
  const eyeY = cy + 8;
  for (const side of [-1, 1]) {
    const ex = cx + side * 20;
    parts.push(`<path d="M${ex - 10},${eyeY} Q${ex},${eyeY - 8} ${ex + 10},${eyeY} Q${ex},${eyeY + 4} ${ex - 10},${eyeY} Z" fill="#fbf8f2"/>`);
    parts.push(`<circle cx="${ex + side * -1}" cy="${eyeY - 1.5}" r="4.2" fill="#3a2414"/><circle cx="${ex + side * -1 + 1.2}" cy="${eyeY - 3}" r="1.2" fill="#fff"/>`);
    parts.push(`<path d="M${ex - 11},${eyeY + 0.5} Q${ex},${eyeY - 9} ${ex + 11},${eyeY + 0.5}" stroke="#2a1d16" stroke-width="2.6" stroke-linecap="round" fill="none"/>`);
    parts.push(`<path d="M${ex - 8},${eyeY + 5} Q${ex},${eyeY + 9} ${ex + 8},${eyeY + 5}" stroke="${skinDark}" stroke-width="1.6" fill="none"/>`);
    const ox = cx + side * 32;
    parts.push(`<path d="M${ox},${eyeY - 3} l${side * 7},-3 M${ox},${eyeY + 1} l${side * 8},1 M${ox},${eyeY + 5} l${side * 7},4" stroke="${skinDark}" stroke-width="1.4" stroke-linecap="round"/>`);
  }

  // Occhiali
  if (p.glasses !== 'none') {
    const frame = p.glasses === 'shades' ? '#111' : '#2b2b2b';
    const fill = p.glasses === 'shades' ? '#1a1d24' : 'none';
    for (const side of [-1, 1]) {
      const ex = cx + side * 20;
      if (p.glasses === 'round') parts.push(`<circle cx="${ex}" cy="${eyeY + 1}" r="13" stroke="${frame}" stroke-width="3" fill="${fill}"/>`);
      else parts.push(`<rect x="${ex - 15}" y="${eyeY - 10}" width="30" height="21" rx="5" stroke="${frame}" stroke-width="3" fill="${fill}" opacity="${p.glasses === 'shades' ? 0.92 : 1}"/>`);
    }
    parts.push(`<path d="M${cx - 8},${eyeY - 1} Q${cx},${eyeY - 5} ${cx + 8},${eyeY - 1}" stroke="${frame}" stroke-width="3" fill="none"/>`);
  }

  // Naso pronunciato
  parts.push(`<path d="M${cx - 2},${cy + 10} C${cx - 6},${cy + 22} ${cx - 14},${cy + 28} ${cx - 10},${cy + 33} C${cx - 4},${cy + 37} ${cx + 6},${cy + 37} ${cx + 11},${cy + 32}" stroke="${skinDark}" stroke-width="2.6" fill="${skinLight}" stroke-linecap="round"/>`);
  parts.push(`<ellipse cx="${cx - 4}" cy="${cy + 33}" rx="3" ry="1.6" fill="${skinDark}"/><ellipse cx="${cx + 6}" cy="${cy + 33}" rx="3" ry="1.6" fill="${skinDark}"/>`);

  // Sorriso largo con i denti in vista
  const mw = 30 * p.grin;
  const my = cy + 46;
  parts.push(`<path d="M${cx - mw - 6},${my - 14} Q${cx - mw - 10},${my - 2} ${cx - mw - 2},${my + 4} M${cx + mw + 6},${my - 14} Q${cx + mw + 10},${my - 2} ${cx + mw + 2},${my + 4}" stroke="${skinDark}" stroke-width="2" fill="none" stroke-linecap="round"/>`);
  parts.push(`<path d="M${cx - mw},${my - 4} Q${cx},${my + 4} ${cx + mw},${my - 4} Q${cx},${my + 26} ${cx - mw},${my - 4} Z" fill="#5c1a1d"/>`);
  parts.push(`<path d="M${cx - mw + 4},${my - 2} Q${cx},${my + 5} ${cx + mw - 4},${my - 2} Q${cx},${my + 12} ${cx - mw + 4},${my - 2} Z" fill="#fbfaf5"/>`);
  parts.push(`<path d="M${cx - mw + 12},${my + 14} Q${cx},${my + 22} ${cx + mw - 12},${my + 14}" fill="#d6646c" opacity="0.7"/>`);
  for (const side of [-1, 1]) parts.push(`<ellipse cx="${cx + side * 31}" cy="${cy + 30}" rx="10" ry="6"fill="#e07a6a" opacity="0.22"/>`);

  if (p.mustache) {
    parts.push(`<path d="M${cx - mw + 2},${my - 6} Q${cx - 14},${my - 18} ${cx},${my - 11} Q${cx + 14},${my - 18} ${cx + mw - 2},${my - 6} Q${cx},${my - 8} ${cx - mw + 2},${my - 6} Z" fill="${p.hair}"/>`);
  }
  if (p.goatee) {
    parts.push(`<path d="M${cx - 12},${my + 22} Q${cx},${my + 40} ${cx + 12},${my + 22} Q${cx},${my + 28} ${cx - 12},${my + 22} Z" fill="${p.hair}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220">${parts.join('')}</svg>`;
}
