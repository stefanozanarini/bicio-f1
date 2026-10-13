import { DEFAULT_TRACK_ID, TRACKS } from '@bicio/sim-core';
import { generateGrid, type Driver } from '../drivers/index.ts';
import type { SessionConfig } from '../protocol.ts';
import type { Livery } from '../render/carModel.ts';
import type { Settings } from '../settings.ts';

export interface SessionSetup {
  config: SessionConfig;
  /** Piloti nell'ordine della griglia (indice = iscritto nella simulazione) */
  drivers: Driver[];
  liveries: Livery[];
  playerIndex: number;
}

const hexToInt = (h: string) => parseInt(h.replace('#', ''), 16);

export function liveryOf(d: Driver): Livery {
  return {
    body: hexToInt(d.portrait.primary),
    accent: hexToInt(d.portrait.secondary),
    helmet: hexToInt(d.portrait.secondary),
    number: d.portrait.number,
  };
}

/** Prepara una sessione: piloti generati (due per team), griglia, livree, posizione del giocatore. */
export function buildSession(settings: Settings, mode: 'practice' | 'race', seed = Math.floor(Math.random() * 1e9)): SessionSetup {
  const r = settings.race;
  const n = mode === 'race' ? r.opponents + 1 : 1;
  const drivers = generateGrid(seed, n);
  let slot = 0;
  if (mode === 'race') {
    if (r.start === 'pole') slot = 0;
    else if (r.start === 'fondo') slot = n - 1;
    else if (r.start === 'meta') slot = Math.floor(n / 2);
    else slot = Math.floor(((seed % 997) / 997) * n);
  }
  const me = drivers[slot];
  me.name = { full: settings.playerName.trim() || 'Tu', code: (settings.playerName.trim() || 'TU').slice(0, 3).toUpperCase() };
  return {
    config: {
      mode,
      trackId: TRACKS[settings.trackId] ? settings.trackId : DEFAULT_TRACK_ID,
      laps: r.laps,
      opponents: r.opponents,
      difficulty: r.difficulty,
      playerSlot: slot,
      seed,
      aids: settings.aids,
      keyboard: settings.keyboard,
    },
    drivers,
    liveries: drivers.map(liveryOf),
    playerIndex: slot,
  };
}
