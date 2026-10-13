import type { LobbySettings, RoomView } from '@bicio/shared';
import { MAX_PLAYERS } from '@bicio/shared';
import { TRACKS } from '@bicio/sim-core';
import { useState } from 'react';

interface Props {
  room: RoomView | null;
  /** Ingresso da link d'invito (altrimenti si crea una stanza) */
  joining: boolean;
  connecting: boolean;
  error: string | null;
  name: string;
  onName: (n: string) => void;
  onConnect: () => void;
  onSettings: (s: LobbySettings) => void;
  onStart: () => void;
  onLeave: () => void;
}

/** "Gioca in balotta": creazione della stanza, link d'invito e sala d'attesa. */
export function Balotta(p: Props) {
  const [copied, setCopied] = useState(false);

  if (!p.room) {
    return (
      <div className="menu">
        <header>
          <h1>
            In balotta<span>!</span>
          </h1>
          <p>{p.joining ? 'Sei stato invitato a una gara con gli amici' : 'Crea una stanza e manda il link agli amici'}</p>
        </header>
        <div className="balotta-box panel">
          <label className="field">
            <span>Il tuo nome</span>
            <input className="track-select" value={p.name} maxLength={24} placeholder="Come ti chiami?" onChange={(e) => p.onName(e.target.value)} />
          </label>
          {p.error && <p className="balotta-error">{p.error}</p>}
          <button className="primary wide" disabled={p.connecting || !p.name.trim()} onClick={p.onConnect}>
            {p.connecting ? 'Collegamento…' : p.joining ? 'Entra nella stanza' : 'Crea la stanza'}
          </button>
          <button className="wide" onClick={p.onLeave}>
            ← Menu
          </button>
        </div>
      </div>
    );
  }

  const room = p.room;
  const host = room.you === room.hostId;
  const link = `${location.origin}${room.invitePath}`;
  const s = room.settings;
  const set = (patch: Partial<LobbySettings>) => p.onSettings({ ...s, ...patch });
  const shareText = `Corri con me a bicio-F1! 🏁 ${link}`;
  const total = room.players.length + s.aiCount;

  return (
    <div className="menu">
      <header>
        <h1>
          In balotta<span>!</span>
        </h1>
        <p>
          Stanza <strong>{room.id}</strong> · {room.players.length}/{MAX_PLAYERS} giocatori
        </p>
      </header>
      <div className="balotta-grid">
        <div className="panel balotta-box">
          <h2>Invita gli amici</h2>
          <div className="invite-link">{link}</div>
          <div className="invite-actions">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // appunti non disponibili: il link resta selezionabile
                }
              }}
            >
              {copied ? '✓ Copiato' : 'Copia link'}
            </button>
            {'share' in navigator && (
              <button onClick={() => navigator.share({ title: 'bicio-F1', text: 'Corri con me a bicio-F1! 🏁', url: link }).catch(() => {})}>Condividi</button>
            )}
            <a className="button-like whatsapp" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </div>
          <p className="hint">Chi apre il link entra senza password. Ti avviso quando qualcuno lo apre.</p>

          <h2>Giocatori</h2>
          <ul className="players">
            {room.players.map((pl) => (
              <li key={pl.id} className={pl.id === room.you ? 'me' : ''}>
                <span>{pl.host ? '👑' : '🏎️'}</span> {pl.name}
                {pl.id === room.you && <small> (tu)</small>}
              </li>
            ))}
            {room.players.length < 2 && <li className="waiting">In attesa degli amici…</li>}
          </ul>
        </div>

        <div className="panel balotta-box">
          <h2>Gara</h2>
          <div className="race-options">
            <label>
              Pista
              <select disabled={!host} value={s.trackId} onChange={(e) => set({ trackId: e.target.value })}>
                {Object.values(TRACKS).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Giri
              <select disabled={!host} value={s.laps} onChange={(e) => set({ laps: Number(e.target.value) })}>
                {[2, 3, 5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Piloti automatici
              <select disabled={!host} value={s.aiCount} onChange={(e) => set({ aiCount: Number(e.target.value) })}>
                {[0, 1, 3, 5, 7, 9, 11].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Livello automatici
              <select disabled={!host} value={s.difficulty} onChange={(e) => set({ difficulty: e.target.value as LobbySettings['difficulty'] })}>
                <option value="facile">Facile</option>
                <option value="medio">Medio</option>
                <option value="difficile">Difficile</option>
              </select>
            </label>
          </div>
          <p className="hint">
            {total} auto in griglia. Ognuno guida con il proprio livello di guida (aiuti) scelto nel menu.
          </p>
          {room.phase === 'race' ? (
            <p className="waiting">C'è una gara in corso: entrerai nella prossima.</p>
          ) : host ? (
            <button className="primary wide" onClick={p.onStart}>
              🏁 Via!
            </button>
          ) : (
            <p className="waiting">Aspettiamo che l'organizzatore dia il via…</p>
          )}
          <button className="wide" onClick={p.onLeave}>
            Esci dalla stanza
          </button>
        </div>
      </div>
    </div>
  );
}
