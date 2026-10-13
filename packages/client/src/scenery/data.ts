import { containsForbidden, type ForbiddenForm } from '../drivers/names.ts';

/**
 * Località della Romagna per i cartelli lungo il circuito, con la distanza
 * approssimativa da Forlì [km]: le più vicine compaiono più spesso.
 */
export const LOCALITA: readonly (readonly [string, number])[] = [
  ['Forlì', 0],
  ['Vecchiazzano', 4],
  ['Villafranca di Forlì', 6],
  ['Carpinello', 7],
  ['San Martino in Strada', 5],
  ['Ronco', 4],
  ['Roncadello', 6],
  ['Villagrappa', 7],
  ['Pievequinta', 8],
  ['Forlimpopoli', 8],
  ['Bertinoro', 11],
  ['Terra del Sole', 10],
  ['Castrocaro Terme', 11],
  ['Meldola', 13],
  ['Fratta Terme', 12],
  ['Predappio', 16],
  ['Dovadola', 18],
  ['Cusercoli', 19],
  ['Civitella di Romagna', 23],
  ['Faenza', 15],
  ['Cesena', 19],
  ['Rocca San Casciano', 25],
  ['Modigliana', 25],
  ['Russi', 22],
  ['Galeata', 32],
  ['Santa Sofia', 37],
  ['Lugo', 33],
  ['Bagnacavallo', 30],
  ['Brisighella', 27],
  ['Ravenna', 30],
  ['Cesenatico', 33],
  ['Cervia', 33],
  ['Milano Marittima', 34],
  ['Gambettola', 27],
  ['Savignano sul Rubicone', 33],
  ['Santarcangelo', 40],
  ['Bellaria', 42],
  ['Rimini', 50],
  ['Riccione', 60],
];

/** Sceglie una località, con probabilità decrescente con la distanza da Forlì. */
export function pickLocalita(r: () => number): readonly [string, number] {
  const w = LOCALITA.map(([, d]) => 1 / (1 + d / 8) ** 2);
  let x = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < LOCALITA.length; i++) {
    x -= w[i];
    if (x <= 0) return LOCALITA[i];
  }
  return LOCALITA[0];
}

interface SponsorData {
  marchi: string[];
  slogan: string[];
  vietati: ForbiddenForm[];
}

const PUBLIC_SPONSORS: SponsorData = {
  marchi: ['Squacquerone Racing', 'Sangiovese Energy', 'Albana Oil', 'Strozzapreti Motors', 'Cassone Express', 'Rombo Pneumatici'],
  slogan: ['Sempre in pista', 'Fatto in Romagna', 'Pieno di energia', 'Da gustare a tutto gas'],
  vietati: [],
};

// File privato opzionale: se manca si usano gli sponsor di fantasia
const privateFiles = import.meta.glob<{ default: SponsorData }>('../../../../.private/sponsor.json', { eager: true });
const privateSponsors = Object.values(privateFiles)[0]?.default;

export function sponsors(): SponsorData {
  const d = privateSponsors?.marchi?.length ? privateSponsors : PUBLIC_SPONSORS;
  return { ...d, marchi: d.marchi.filter((m) => !containsForbidden(m, d.vietati ?? [])) };
}
