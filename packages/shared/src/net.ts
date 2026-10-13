import type { Difficulty, RacePhase, RemoteCarState } from '@bicio/sim-core';

/**
 * Protocollo multiplayer ("Gioca in balotta"), messaggi JSON su WebSocket.
 *
 * Ogni giocatore simula la propria auto nel browser e invia il suo stato al server;
 * il server fa girare i piloti automatici, tiene giri, classifica e arrivo ufficiali
 * e rimanda a tutti lo stato di tutte le auto.
 */

export const WS_PATH = '/api/ws';
/** Frequenza di invio dello stato dell'auto del giocatore [Hz] */
export const CLIENT_STATE_HZ = 30;
/** Frequenza degli snapshot dal server [Hz] */
export const SERVER_SNAP_HZ = 20;
export const MAX_PLAYERS = 12;

export interface LobbySettings {
  trackId: string;
  laps: number;
  /** Piloti automatici in aggiunta ai giocatori */
  aiCount: number;
  difficulty: Difficulty;
}

export interface PlayerView {
  id: string;
  name: string;
  host: boolean;
  connected: boolean;
}

export type RoomPhase = 'lobby' | 'race';

export interface RoomView {
  id: string;
  /** Percorso del link d'invito (da aggiungere all'indirizzo del sito) */
  invitePath: string;
  hostId: string;
  you: string;
  players: PlayerView[];
  settings: LobbySettings;
  phase: RoomPhase;
}

export interface RaceStartEntrant {
  kind: 'player' | 'ai';
  playerId?: string;
  name?: string;
}

export interface RaceStart {
  seed: number;
  trackId: string;
  laps: number;
  difficulty: Difficulty;
  entrants: RaceStartEntrant[];
  /** Indice dell'auto del destinatario */
  you: number;
}

export interface NetStanding {
  index: number;
  position: number;
  lap: number;
  gap: number;
  lapsBehind: number;
  finished: boolean;
  finishTime: number | null;
  best: number | null;
  retired: boolean;
}

export interface NetRaceInfo {
  phase: RacePhase;
  lights: number;
  laps: number;
  raceTime: number;
  standings: NetStanding[];
}

export type ClientMessage =
  | { t: 'create'; name: string }
  | { t: 'join'; room: string; token: string; name: string }
  | { t: 'settings'; settings: LobbySettings }
  | { t: 'start' }
  | { t: 'lobby' }
  | { t: 'state'; s: number[] }
  | { t: 'ping'; c: number; rtt?: number }
  | { t: 'leave' };

export type NoticeKind = 'invite' | 'join' | 'leave' | 'info';

export type ServerMessage =
  | { t: 'room'; room: RoomView }
  | { t: 'notice'; kind: NoticeKind; text: string }
  | { t: 'start'; race: RaceStart }
  | { t: 'snap'; time: number; cars: (number[] | null)[]; race: NetRaceInfo }
  | { t: 'pong'; c: number }
  | { t: 'error'; text: string };

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Stato dell'auto compattato in un array di numeri arrotondati (meno byte in rete). */
export function packState(s: RemoteCarState): number[] {
  return [r2(s.x), r2(s.y), r4(s.heading), r2(s.u), r2(s.v), r4(s.r), r4(s.steer), r2(s.spin[0]), r2(s.spin[1]), r2(s.spin[2]), r2(s.spin[3]), r2(s.aero), s.harvesting ? 1 : 0];
}

export function unpackState(a: readonly number[]): RemoteCarState | null {
  if (!Array.isArray(a) || a.length < 13 || a.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  return {
    x: a[0],
    y: a[1],
    heading: a[2],
    u: a[3],
    v: a[4],
    r: a[5],
    steer: a[6],
    spin: [a[7], a[8], a[9], a[10]],
    aero: a[11],
    harvesting: a[12] === 1,
  };
}

/** Nome del giocatore ripulito: niente caratteri di controllo, lunghezza limitata. */
export function cleanName(n: unknown): string {
  const s = typeof n === 'string' ? n.replace(/[\u0000-\u001f<>]/g, '').trim() : '';
  return s.slice(0, 24) || 'Pilota';
}
