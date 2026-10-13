import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { registerAccess } from './access.ts';
import { registerMultiplayer } from './multiplayer.ts';
import { Rooms } from './rooms.ts';

/**
 * Server di bicio-F1.
 * Serve il client compilato, l'endpoint di stato e il multiplayer "in balotta" (WebSocket).
 * Fasi successive: account e salvataggi (PostgreSQL).
 */
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const PUBLIC_DIR = resolve(process.env.PUBLIC_DIR ?? 'public');
const VERSION = process.env.APP_VERSION ?? 'dev';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true });

const rooms = new Rooms(process.env.SESSION_SECRET ?? randomBytes(16).toString('hex'));
registerAccess(app, { onInvite: (room, token) => rooms.validateInvite(room, token, true) !== null });
await registerMultiplayer(app, rooms);

app.get('/api/health', async () => ({ ok: true, version: VERSION, uptime: Math.round(process.uptime()), rooms: rooms.count }));

if (existsSync(PUBLIC_DIR)) {
  await app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    // I file con hash nel nome possono restare in cache a lungo, index.html no
    setHeaders(res, path) {
      res.setHeader('Cache-Control', path.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable');
    },
  });
  // Applicazione a pagina singola: le rotte sconosciute (non /api) servono index.html
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
    return reply.type('text/html').header('Cache-Control', 'no-cache').sendFile('index.html');
  });
} else {
  app.log.warn(`Cartella del client non trovata (${PUBLIC_DIR}): servo solo le API`);
}

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: PORT, host: HOST });
