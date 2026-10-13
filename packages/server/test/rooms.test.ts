import { packState, type ServerMessage } from '@bicio/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { Rooms, type Room, type Socket } from '../src/rooms.ts';

class FakeSocket implements Socket {
  readyState = 1;
  readonly inbox: ServerMessage[] = [];
  send(data: string) {
    this.inbox.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  last<T extends ServerMessage['t']>(t: T) {
    return this.inbox.filter((m) => m.t === t).at(-1) as Extract<ServerMessage, { t: T }> | undefined;
  }
}

describe('stanze "in balotta"', () => {
  let room: Room | null = null;
  afterEach(() => room?.stopLoop());

  it('invito, ingresso, permessi dell\'organizzatore, partenza e ritiro', () => {
    const rooms = new Rooms('segreto-di-prova');
    room = rooms.create()!;
    const hs = new FakeSocket();
    const gs = new FakeSocket();
    const host = room.addPlayer('Host', hs)!;
    // Il link d'invito apre la stanza solo con il token giusto, e avvisa l'organizzatore
    expect(rooms.validateInvite(room.id, 'sbagliato', true)).toBeNull();
    expect(rooms.validateInvite(room.id, room.token, true)).toBe(room);
    expect(hs.last('notice')?.kind).toBe('invite');
    const guest = room.addPlayer('Amico', gs)!;
    expect(hs.last('notice')?.text).toContain('Amico');

    // Solo l'organizzatore cambia le impostazioni e dà il via
    room.handle(guest.id, { t: 'settings', settings: { trackId: 'riviera', laps: 9, aiCount: 9, difficulty: 'difficile' } });
    expect(room.settings.laps).toBe(5);
    room.handle(host.id, { t: 'settings', settings: { trackId: 'lido-di-savio', laps: 2, aiCount: 2, difficulty: 'facile' } });
    expect(room.settings).toEqual({ trackId: 'lido-di-savio', laps: 2, aiCount: 2, difficulty: 'facile' });
    room.handle(guest.id, { t: 'start' });
    expect(room.phase).toBe('lobby');
    room.handle(host.id, { t: 'start' });
    expect(room.phase).toBe('race');

    const start = gs.last('start')!.race;
    expect(start.entrants.length).toBe(4);
    expect(start.entrants[start.you].playerId).toBe(guest.id);

    // Lo stato inviato dal giocatore aggiorna la sua auto sul server
    const s = room.session!;
    const st = s.carState(start.you);
    room.handle(guest.id, { t: 'state', s: packState({ ...st, x: st.x + 3 }) });
    expect(s.entrants[start.you].car.x).toBeCloseTo(st.x + 3, 1);
    // Stato malformato: ignorato
    room.handle(guest.id, { t: 'state', s: [1, 2, 3] });
    expect(s.entrants[start.you].car.x).toBeCloseTo(st.x + 3, 1);

    // Chi esce durante la gara viene ritirato; l'organizzatore passa al successivo
    room.removePlayer(host.id);
    const hostIndex = start.entrants.findIndex((e) => e.playerId === host.id);
    expect(s.entrants[hostIndex].retired).toBe(true);
    expect(room.hostId).toBe(guest.id);
  });
});
