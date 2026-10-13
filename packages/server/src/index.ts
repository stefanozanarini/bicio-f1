import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Server di bicio-F1.
 * Fase 0: serve il client compilato e un endpoint di stato.
 * Fasi successive: account e salvataggi (PostgreSQL), game server multiplayer (WebSocket).
 */
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const PUBLIC_DIR = resolve(process.env.PUBLIC_DIR ?? 'public');
const VERSION = process.env.APP_VERSION ?? 'dev';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true });

app.get('/api/health', async () => ({ ok: true, version: VERSION, uptime: Math.round(process.uptime()) }));

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
