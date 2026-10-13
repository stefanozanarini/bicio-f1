import { WS_PATH, type ClientMessage, type RaceStart, type RoomView, type ServerMessage, type NoticeKind } from '@bicio/shared';

export interface NetHandlers {
  onRoom(room: RoomView): void;
  onNotice(kind: NoticeKind, text: string): void;
  onStart(race: RaceStart): void;
  onSnap(msg: Extract<ServerMessage, { t: 'snap' }>): void;
  onError(text: string): void;
  onClose(): void;
}

/**
 * Collegamento WebSocket con il server per il multiplayer.
 * Misura il tempo di andata e ritorno (serve a proiettare in avanti le auto degli altri).
 */
export class NetClient {
  private ws: WebSocket | null = null;
  private pingTimer = 0;
  /** Tempo di andata e ritorno [ms], media mobile */
  rtt = 120;
  handlers: NetHandlers;
  private closedByUs = false;

  constructor(handlers: NetHandlers) {
    this.handlers = handlers;
  }

  connect(first: ClientMessage): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}${WS_PATH}`);
    this.ws = ws;
    ws.onopen = () => {
      this.send(first);
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', c: performance.now(), rtt: Math.round(this.rtt) }), 2000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.t) {
        case 'room':
          this.handlers.onRoom(msg.room);
          break;
        case 'notice':
          this.handlers.onNotice(msg.kind, msg.text);
          break;
        case 'start':
          this.handlers.onStart(msg.race);
          break;
        case 'snap':
          this.handlers.onSnap(msg);
          break;
        case 'pong': {
          const sample = performance.now() - msg.c;
          this.rtt = this.rtt * 0.7 + sample * 0.3;
          break;
        }
        case 'error':
          this.handlers.onError(msg.text);
          break;
      }
    };
    ws.onclose = () => {
      window.clearInterval(this.pingTimer);
      if (!this.closedByUs) this.handlers.onClose();
    };
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closedByUs = true;
    this.send({ t: 'leave' });
    window.clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }
}

/** Parametri del link d'invito nell'indirizzo della pagina, se presenti. */
export function inviteFromUrl(): { room: string; token: string } | null {
  const q = new URLSearchParams(location.search);
  const room = q.get('balotta');
  const token = q.get('k');
  return room && token ? { room, token } : null;
}

/** Toglie i parametri dell'invito dall'indirizzo (resta pulito se si ricarica). */
export function clearInviteFromUrl(): void {
  history.replaceState(null, '', location.pathname);
}

/** Avviso sonoro breve (due note) per inviti e ingressi. */
export function ding(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.2, now + i * 0.15 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.15);
      o.stop(now + i * 0.15 + 0.3);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // audio non disponibile
  }
}

/** Notifica del sistema quando la pagina non è in primo piano (se l'utente l'ha permessa). */
export function systemNotify(text: string): void {
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('bicio-F1', { body: text });
  } catch {
    // notifiche non disponibili
  }
}

export function askNotificationPermission(): void {
  try {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
  } catch {
    // non supportato
  }
}
