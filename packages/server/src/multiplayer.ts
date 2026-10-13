import websocket from '@fastify/websocket';
import { WS_PATH, type ClientMessage } from '@bicio/shared';
import type { FastifyInstance } from 'fastify';
import type { Room, Rooms } from './rooms.ts';

/**
 * WebSocket del multiplayer. Il primo messaggio crea una stanza o entra in una esistente
 * (con il token del link d'invito); poi i messaggi passano alla stanza.
 */
export async function registerMultiplayer(app: FastifyInstance, rooms: Rooms): Promise<void> {
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });

  app.get(WS_PATH, { websocket: true }, (socket) => {
    let room: Room | null = null;
    let pid = '';
    const fail = (text: string) => {
      socket.send(JSON.stringify({ t: 'error', text }));
      socket.close();
    };

    socket.on('message', (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (!room) {
        if (msg.t === 'create') {
          room = rooms.create();
          if (!room) return fail('Troppe stanze aperte, riprova tra poco');
        } else if (msg.t === 'join') {
          room = rooms.validateInvite(String(msg.room), String(msg.token), false);
          if (!room) return fail('Link d’invito non valido o stanza chiusa');
          // A gara in corso si entra in sala e si corre dalla prossima
        } else return;
        const p = room.addPlayer(msg.name, socket);
        if (!p) {
          room = null;
          return fail('La stanza è piena');
        }
        pid = p.id;
        return;
      }
      room.handle(pid, msg);
    });

    socket.on('close', () => {
      if (room && pid) room.removePlayer(pid);
    });
  });
}
