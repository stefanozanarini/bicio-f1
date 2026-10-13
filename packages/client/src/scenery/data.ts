import { containsForbidden, type ForbiddenForm } from '../drivers/names.ts';

/** Località della Romagna per i cartelli stradali lungo il circuito. */
export const LOCALITA = [
  'Rimini',
  'Riccione',
  'Cattolica',
  'Misano Adriatico',
  'Bellaria',
  'Igea Marina',
  'Cesenatico',
  'Cervia',
  'Milano Marittima',
  'Ravenna',
  'Lido di Classe',
  'Cesena',
  'Forlì',
  'Faenza',
  'Lugo',
  'Bagnacavallo',
  'Russi',
  'Santarcangelo',
  'Savignano sul Rubicone',
  'Gatteo a Mare',
  'Gambettola',
  'Longiano',
  'Bertinoro',
  'Predappio',
  'Castrocaro Terme',
  'Brisighella',
  'Verucchio',
  'Coriano',
  'Morciano',
  'Cotignola',
];

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
