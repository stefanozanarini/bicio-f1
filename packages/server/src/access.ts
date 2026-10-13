import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Protezione d'accesso leggera: una sola password condivisa (variabile ACCESS_PASSWORD).
 * Dopo il login il browser riceve un cookie firmato valido 30 giorni.
 * Se ACCESS_PASSWORD non è impostata la protezione è disattivata (sviluppo).
 */
const COOKIE = 'bf1_access';
const MAX_AGE = 60 * 60 * 24 * 30;

function token(password: string): string {
  const secret = process.env.SESSION_SECRET ?? 'bicio-f1';
  return createHmac('sha256', secret).update(`accesso:${password}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function readCookie(req: FastifyRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const LOGIN_PAGE = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>bicio-F1 · accesso</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(ellipse at top, #1d2433, #0d0f14 60%); color: #f2f2f7; font-family: system-ui, sans-serif; }
  form { background: rgba(12,14,20,.8); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 28px; width: min(320px, calc(100vw - 32px)); box-sizing: border-box; }
  h1 { margin: 0 0 18px; font-style: italic; letter-spacing: -1px; } h1 span { color: #ff7a00; }
  input, button { width: 100%; box-sizing: border-box; font: inherit; border-radius: 8px; padding: 12px; }
  input { background: #1b1f27; color: #f2f2f7; border: 1px solid #3a404d; margin-bottom: 12px; }
  button { background: #ff7a00; border: 0; font-weight: 700; color: #111; cursor: pointer; }
  p { color: #ff453a; min-height: 1.2em; margin: 10px 0 0; font-size: 14px; }
</style>
</head>
<body>
<form id="f">
  <h1>bicio<span>-F1</span></h1>
  <input id="p" type="password" placeholder="Password" autocomplete="current-password" autofocus required>
  <button>Entra</button>
  <p id="e"></p>
</form>
<script>
  document.getElementById('f').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('p').value }) });
    if (r.ok) location.reload();
    else document.getElementById('e').textContent = 'Password errata';
  });
</script>
</body>
</html>`;

export function registerAccess(app: FastifyInstance): void {
  const password = process.env.ACCESS_PASSWORD ?? '';
  if (!password) {
    app.log.warn('ACCESS_PASSWORD non impostata: accesso libero');
    return;
  }
  const expected = token(password);

  app.post<{ Body: { password?: string } }>('/api/login', async (req, reply) => {
    const given = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!safeEqual(token(given), expected)) {
      // Rallenta i tentativi a raffica
      await new Promise((r) => setTimeout(r, 800));
      return reply.code(401).send({ ok: false });
    }
    const secure = req.protocol === 'https' ? '; Secure' : '';
    reply.header('Set-Cookie', `${COOKIE}=${expected}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure}`);
    return { ok: true };
  });

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split('?')[0];
    if (path === '/api/login' || path === '/api/health') return;
    const c = readCookie(req, COOKIE);
    if (c && safeEqual(c, expected)) return;
    if (path.startsWith('/api/')) return reply.code(401).send({ error: 'accesso richiesto' });
    return reply.code(401).type('text/html').header('Cache-Control', 'no-store').send(LOGIN_PAGE);
  });
}
