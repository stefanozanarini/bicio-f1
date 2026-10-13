import {
  cleanName,
  MAX_PLAYERS,
  packState,
  SERVER_SNAP_HZ,
  unpackState,
  type ClientMessage,
  type LobbySettings,
  type NetRaceInfo,
  type NoticeKind,
  type RaceStart,
  type RaceStartEntrant,
  type RoomView,
  type ServerMessage,
} from '@bicio/shared';
import { DEFAULT_TRACK_ID, DT, lcg, RaceSession, randomSkill, TRACKS, type Difficulty, type EntrantSpec } from '@bicio/sim-core';
import { createHmac, randomBytes } from 'node:crypto';

/** Interfaccia minima del socket (quella di `ws`), così le stanze si possono provare senza rete. */
export interface Socket {
  send(data: string): void;
  close(): void;
  readyState: number;
}

interface Player {
  id: string;
  name: string;
  socket: Socket | null;
  /** Tempo di andata e ritorno misurato dal client [ms] */
  rtt: number;
}

const MAX_STEPS_PER_TICK = 40;
const SNAP_EVERY_MS = 1000 / SERVER_SNAP_HZ;
/** Dopo l'arrivo la simulazione continua ancora un po', poi si ferma per non consumare CPU */
const STOP_AFTER_FINISH_S = 30;
const DIFFICULTIES: Difficulty[] = ['facile', 'medio', 'difficile'];

const id = (n = 6) => randomBytes(n).toString('base64url').replace(/[-_]/g, '').slice(0, n).toUpperCase();

function sanitizeSettings(s: Partial<LobbySettings> | undefined, prev: LobbySettings): LobbySettings {
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  return {
    trackId: typeof s?.trackId === 'string' && TRACKS[s.trackId] ? s.trackId : prev.trackId,
    laps: n(s?.laps, 1, 30, prev.laps),
    aiCount: n(s?.aiCount, 0, 15, prev.aiCount),
    difficulty: DIFFICULTIES.includes(s?.difficulty as Difficulty) ? (s!.difficulty as Difficulty) : prev.difficulty,
  };
}

/**
 * Una stanza "in balotta": sala d'attesa con i giocatori, poi la gara.
 * Durante la gara il server fa girare i piloti automatici e il cronometraggio;
 * le auto dei giocatori sono simulate nei loro browser e qui arrivano come stato remoto.
 */
export class Room {
  readonly id: string;
  readonly token: string;
  readonly players = new Map<string, Player>();
  hostId = '';
  settings: LobbySettings = { trackId: DEFAULT_TRACK_ID, laps: 5, aiCount: 5, difficulty: 'medio' };
  phase: 'lobby' | 'race' = 'lobby';
  session: RaceSession | null = null;
  /** Indice dell'auto di ogni giocatore nella gara in corso */
  private readonly entrantOf = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private last = 0;
  private acc = 0;
  private lastSnap = 0;
  private finishedAt = 0;
  private lastInviteNotice = 0;
  lastActivity = Date.now();

  constructor(secret: string) {
    this.id = id(6);
    this.token = createHmac('sha256', secret).update(`invito:${this.id}`).digest('base64url').slice(0, 16);
  }

  get invitePath(): string {
    return `/?balotta=${this.id}&k=${this.token}`;
  }

  get empty(): boolean {
    return [...this.players.values()].every((p) => !p.socket);
  }

  view(you: string): RoomView {
    return {
      id: this.id,
      invitePath: this.invitePath,
      hostId: this.hostId,
      you,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, host: p.id === this.hostId, connected: p.socket !== null })),
      settings: this.settings,
      phase: this.phase,
    };
  }

  private send(p: Player, msg: ServerMessage): void {
    if (p.socket && p.socket.readyState === 1) p.socket.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMessage, except?: string): void {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.id !== except && p.socket && p.socket.readyState === 1) p.socket.send(data);
  }

  private broadcastRoom(): void {
    for (const p of this.players.values()) this.send(p, { t: 'room', room: this.view(p.id) });
  }

  notice(kind: NoticeKind, text: string, to?: string): void {
    const msg: ServerMessage = { t: 'notice', kind, text };
    if (to) {
      const p = this.players.get(to);
      if (p) this.send(p, msg);
    } else this.broadcast(msg);
  }

  /** Qualcuno ha aperto il link d'invito (prima ancora di entrare): si avvisa l'host. */
  inviteOpened(): void {
    const now = Date.now();
    if (now - this.lastInviteNotice < 3000) return;
    this.lastInviteNotice = now;
    this.notice('invite', 'Qualcuno ha aperto il tuo link d’invito!', this.hostId);
  }

  addPlayer(name: string, socket: Socket): Player | null {
    if (this.players.size >= MAX_PLAYERS) return null;
    const p: Player = { id: id(8), name: cleanName(name), socket, rtt: 100 };
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    this.lastActivity = Date.now();
    if (p.id !== this.hostId) this.notice('join', `${p.name} è entrato in balotta`);
    this.broadcastRoom();
    return p;
  }

  removePlayer(pid: string): void {
    const p = this.players.get(pid);
    if (!p) return;
    p.socket = null;
    if (this.phase === 'race' && this.session) {
      const i = this.entrantOf.get(pid);
      if (i !== undefined) this.session.retire(i);
    }
    this.players.delete(pid);
    if (this.hostId === pid) this.hostId = this.players.keys().next().value ?? '';
    this.notice('leave', `${p.name} è uscito`);
    this.broadcastRoom();
    if (this.players.size === 0) this.stopLoop();
  }

  handle(pid: string, msg: ClientMessage): void {
    const p = this.players.get(pid);
    if (!p) return;
    this.lastActivity = Date.now();
    const host = pid === this.hostId;
    switch (msg.t) {
      case 'settings':
        if (host && this.phase === 'lobby') {
          this.settings = sanitizeSettings(msg.settings, this.settings);
          this.broadcastRoom();
        }
        break;
      case 'start':
        if (host && this.phase === 'lobby') this.startRace();
        break;
      case 'lobby':
        if (host && this.phase === 'race') this.backToLobby();
        break;
      case 'state': {
        const i = this.entrantOf.get(pid);
        const st = unpackState(msg.s);
        if (this.session && i !== undefined && st) this.session.setRemoteState(i, st, Math.min(p.rtt, 400) / 2000);
        break;
      }
      case 'ping':
        if (typeof msg.rtt === 'number' && Number.isFinite(msg.rtt)) p.rtt = Math.max(0, Math.min(2000, msg.rtt));
        this.send(p, { t: 'pong', c: msg.c });
        break;
      case 'leave':
        this.removePlayer(pid);
        break;
    }
  }

  private startRace(): void {
    const seed = randomBytes(4).readUInt32LE(0);
    const r = lcg(seed);
    const entrants: RaceStartEntrant[] = [];
    for (const p of this.players.values()) entrants.push({ kind: 'player', playerId: p.id, name: p.name });
    for (let k = 0; k < this.settings.aiCount; k++) entrants.push({ kind: 'ai' });
    // Griglia sorteggiata
    for (let i = entrants.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [entrants[i], entrants[j]] = [entrants[j], entrants[i]];
    }
    const specs: EntrantSpec[] = entrants.map((e, i) =>
      e.kind === 'player' ? { id: e.playerId!, kind: 'remote' } : { id: `ai${i}`, kind: 'ai', skill: randomSkill(r, this.settings.difficulty) },
    );
    this.session = new RaceSession(TRACKS[this.settings.trackId], specs, { laps: this.settings.laps, seed });
    this.entrantOf.clear();
    entrants.forEach((e, i) => e.playerId && this.entrantOf.set(e.playerId, i));
    this.phase = 'race';
    this.finishedAt = 0;
    for (const p of this.players.values()) {
      const race: RaceStart = {
        seed,
        trackId: this.settings.trackId,
        laps: this.settings.laps,
        difficulty: this.settings.difficulty,
        entrants,
        you: this.entrantOf.get(p.id) ?? -1,
      };
      this.send(p, { t: 'start', race });
    }
    this.broadcastRoom();
    this.startLoop();
  }

  private backToLobby(): void {
    this.stopLoop();
    this.session = null;
    this.entrantOf.clear();
    this.phase = 'lobby';
    this.broadcastRoom();
  }

  private startLoop(): void {
    this.stopLoop();
    this.last = performance.now();
    this.acc = 0;
    this.timer = setInterval(() => this.tick(), 4);
  }

  stopLoop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const s = this.session;
    if (!s) return;
    const now = performance.now();
    this.acc += (now - this.last) / 1000;
    this.last = now;
    let steps = Math.floor(this.acc / DT);
    if (steps > MAX_STEPS_PER_TICK) {
      steps = MAX_STEPS_PER_TICK;
      this.acc = 0;
    } else this.acc -= steps * DT;
    for (let i = 0; i < steps; i++) s.step();

    if (now - this.lastSnap >= SNAP_EVERY_MS) {
      this.lastSnap = now;
      this.broadcast({ t: 'snap', time: s.time, cars: s.entrants.map((e) => (e.retired ? null : packState(s.carState(e.index)))), race: raceInfo(s) });
    }
    if (s.phase === 'finished') {
      if (!this.finishedAt) this.finishedAt = s.time;
      if (s.time - this.finishedAt > STOP_AFTER_FINISH_S) this.stopLoop();
    }
  }
}

function raceInfo(s: RaceSession): NetRaceInfo {
  return {
    phase: s.phase,
    lights: s.lights,
    laps: s.options.laps,
    raceTime: s.phase === 'racing' || s.phase === 'finished' ? s.time - s.raceStartTime : 0,
    standings: s.entrants
      .map((e) => ({
        index: e.index,
        position: e.position,
        lap: e.timing.state.lap,
        gap: Math.round(e.gap * 1000) / 1000,
        lapsBehind: e.lapsBehind,
        finished: e.finished,
        finishTime: e.finishTime,
        best: e.timing.state.best,
        retired: e.retired,
      }))
      .sort((a, b) => a.position - b.position),
  };
}

/** Tutte le stanze del server. */
export class Rooms {
  private readonly rooms = new Map<string, Room>();
  private readonly cleaner: NodeJS.Timeout;

  constructor(private readonly secret: string) {
    // Stanze vuote o inattive da troppo tempo vengono chiuse
    this.cleaner = setInterval(() => {
      const now = Date.now();
      for (const [k, room] of this.rooms) {
        if ((room.empty && now - room.lastActivity > 60_000) || now - room.lastActivity > 3 * 3600_000) {
          room.stopLoop();
          this.rooms.delete(k);
        }
      }
    }, 30_000);
    this.cleaner.unref();
  }

  get count(): number {
    return this.rooms.size;
  }

  create(): Room | null {
    if (this.rooms.size >= 50) return null;
    const room = new Room(this.secret);
    this.rooms.set(room.id, room);
    return room;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /** Verifica il link d'invito; se valido avvisa l'host che qualcuno lo ha aperto. */
  validateInvite(roomId: string, token: string, notify: boolean): Room | null {
    const room = this.rooms.get(roomId);
    if (!room || room.token !== token) return null;
    if (notify) room.inviteOpened();
    return room;
  }
}
