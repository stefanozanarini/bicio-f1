import { TRACKS } from '@bicio/sim-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameClient, type PerfInfo } from './game/GameClient.ts';
import { buildSession, type SessionSetup } from './game/session.ts';
import type { Snapshot } from './protocol.ts';
import { CAMERA_LABELS, QUALITY_LABELS } from './render/Renderer.ts';
import { TiltSteering } from './input/tilt.ts';
import { loadSettings, saveSettings, touchActive, type Settings } from './settings.ts';
import { DriversGallery } from './ui/DriversGallery.tsx';
import { Garage } from './ui/Garage.tsx';
import { Hud } from './ui/Hud.tsx';
import { Results, StartLights, Tower } from './ui/RaceUi.tsx';
import { DrivingLevelSelect, SettingsPanel } from './ui/SettingsPanel.tsx';
import { TelemetryPanel } from './ui/TelemetryPanel.tsx';
import { TouchControls } from './ui/TouchControls.tsx';

/** Schermo intero e orientamento orizzontale, dove il browser lo consente. */
async function enterFullscreen(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  } catch {
    // non supportato (es. iPhone): si gioca comunque
  }
  try {
    await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    // non supportato
  }
}

type Screen = 'menu' | 'drive' | 'drivers' | 'garage';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [perf, setPerf] = useState<PerfInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gamepadName, setGamepadName] = useState<string | null>(null);
  const [setup, setSetup] = useState<SessionSetup | null>(null);
  const [resultsDismissed, setResultsDismissed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const game = useRef<GameClient | null>(null);

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 2500);
  }, []);

  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
    game.current?.applySettings(s);
  }, []);

  // Rilevamento gamepad anche dal menu
  useEffect(() => {
    const id = window.setInterval(() => {
      const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      setGamepadName(pads.find((p) => p && p.connected)?.id ?? null);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (screen !== 'drive' || !container.current || !setup) return;
    setSnap(null);
    setResultsDismissed(false);
    const g = new GameClient(container.current, settings, setup, {
      onHud: setSnap,
      onPauseRequest: () => setPaused((p) => !p),
      onHidden: () => setPaused(true),
      onCamera: (m) => {
        updateSettings({ ...loadSettings(), camera: m });
        flash(`Visuale: ${CAMERA_LABELS[m]}`);
      },
      onToggleTelemetry: () => setShowTelemetry((t) => !t),
      onPerf: setPerf,
      onNotice: flash,
    });
    game.current = g;
    return () => {
      g.dispose();
      game.current = null;
    };
    // Una sessione per ogni ingresso in pista (o rivincita)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, setup]);

  useEffect(() => {
    game.current?.setPaused(paused);
  }, [paused]);

  const touch = touchActive(settings);
  const telemetrySource = useCallback(() => game.current?.telemetry ?? [], []);

  if (screen === 'drivers') return <DriversGallery onBack={() => setScreen('menu')} />;
  if (screen === 'garage') return <Garage onBack={() => setScreen('menu')} />;

  /** Entra in pista: prepara la sessione dentro il gesto dell'utente (schermo intero, sensori). */
  const start = async (mode: 'practice' | 'race') => {
    if (touchActive(settings)) {
      // Permesso dei sensori e schermo intero vanno chiesti subito, dentro il gesto dell'utente
      const perm = settings.touch.steering === 'tilt' ? TiltSteering.requestPermission() : Promise.resolve(true);
      const fs = enterFullscreen();
      const [granted] = await Promise.all([perm, fs]);
      if (!granted) {
        updateSettings({ ...settings, touch: { ...settings.touch, steering: 'arrows' } });
        flash('Sensori di movimento non autorizzati: uso le frecce');
      }
    }
    setSetup(buildSession(loadSettings(), mode));
    setPaused(false);
    setScreen('drive');
  };
  const race = settings.race;
  const setRace = (patch: Partial<Settings['race']>) => updateSettings({ ...settings, race: { ...race, ...patch } });

  if (screen === 'menu') {
    return (
      <div className="menu">
        <header>
          <h1>
            bicio<span>-F1</span>
          </h1>
          <p>Simulatore di Formula 1 · vettura 2026 · aero attiva · ERS 350 kW</p>
        </header>
        <div className="menu-body">
          <div className="menu-start">
            <label className="field">
              <span>Pista</span>
              <select className="track-select" value={settings.trackId} onChange={(e) => updateSettings({ ...settings, trackId: e.target.value })}>
                {Object.values(TRACKS).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Il tuo nome</span>
              <input
                className="track-select"
                value={settings.playerName}
                maxLength={24}
                placeholder="Tu"
                onChange={(e) => updateSettings({ ...settings, playerName: e.target.value })}
              />
            </label>

            <label className="field">
              <span>Livello di guida</span>
              <DrivingLevelSelect settings={settings} onChange={updateSettings} />
            </label>

            <h2>Gioca da solo</h2>
            <div className="race-options">
              <label>
                Giri
                <select value={race.laps} onChange={(e) => setRace({ laps: Number(e.target.value) })}>
                  {[2, 3, 5, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Avversari
                <select value={race.opponents} onChange={(e) => setRace({ opponents: Number(e.target.value) })}>
                  {[1, 3, 5, 7, 9, 11, 15, 19].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Livello
                <select value={race.difficulty} onChange={(e) => setRace({ difficulty: e.target.value as Settings['race']['difficulty'] })}>
                  <option value="facile">Facile</option>
                  <option value="medio">Medio</option>
                  <option value="difficile">Difficile</option>
                </select>
              </label>
              <label>
                Partenza
                <select value={race.start} onChange={(e) => setRace({ start: e.target.value as Settings['race']['start'] })}>
                  <option value="pole">In pole</option>
                  <option value="meta">A metà griglia</option>
                  <option value="fondo">In fondo</option>
                  <option value="casuale">Casuale</option>
                </select>
              </label>
            </div>
            <button className="primary" onClick={() => start('race')}>
              🏁 Corri la gara
            </button>

            <h2>Gioca in balotta</h2>
            <button className="secondary-wide" disabled title="In arrivo: multiplayer con link d'invito">
              👥 In arrivo: gara con gli amici
            </button>

            <h2>Altro</h2>
            <button className="secondary-wide" onClick={() => start('practice')}>
              Prove libere
            </button>
            <button className="secondary-wide" onClick={() => setScreen('drivers')}>
              Piloti (anteprima)
            </button>
            <button className="secondary-wide" onClick={() => setScreen('garage')}>
              Garage (auto in 3D)
            </button>
          </div>
          <SettingsPanel settings={settings} onChange={updateSettings} gamepadName={gamepadName} />
        </div>
      </div>
    );
  }

  const inRace = setup?.config.mode === 'race' && snap !== null;
  const meFinished = inRace && snap.race.standings.some((r) => r.index === snap.race.focus && r.finished);
  const showResults = inRace && !resultsDismissed && (snap.race.phase === 'finished' || meFinished);

  return (
    <div className={`drive ${touch ? 'touch' : ''}`}>
      <div ref={container} className="viewport" />
      {snap && <Hud snap={snap} />}
      {inRace && setup && <Tower race={snap.race} drivers={setup.drivers} />}
      {inRace && <StartLights race={snap.race} />}
      {touch && !paused && (
        <TouchControls
          press={(a, d) => game.current?.input.setVirtual(a, d)}
          arrows={settings.touch.steering === 'arrows'}
          shiftButtons={!settings.aids.autoShift}
          onRecenter={() => {
            game.current?.input.tilt.recenter();
            flash('Sterzo ricentrato');
          }}
        />
      )}
      {touch && <div className="rotate-hint">Ruota il telefono in orizzontale 📱↻</div>}
      {showTelemetry && <TelemetryPanel source={telemetrySource} />}
      {perf && (
        <div className="perf">
          {Math.round(perf.fps)} fps · fisica {Math.round(perf.physicsHz)} Hz ({perf.physicsLoad.toFixed(0)}%) · {QUALITY_LABELS[perf.quality]}
        </div>
      )}
      {notice && <div className="notice">{notice}</div>}
      {!snap && <div className="loading">Caricamento…</div>}
      {showResults && setup && snap && (
        <Results
          race={snap.race}
          drivers={setup.drivers}
          onRematch={() => setSetup(buildSession(loadSettings(), 'race'))}
          onMenu={() => setScreen('menu')}
        />
      )}
      {paused && (
        <div className="pause">
          <div className="pause-box">
            <h2>Pausa</h2>
            <div className="pause-actions">
              <button className="primary" onClick={() => setPaused(false)}>
                Riprendi
              </button>
              <button
                onClick={() => {
                  game.current?.restart();
                  setResultsDismissed(false);
                  setPaused(false);
                }}
              >
                {setup?.config.mode === 'race' ? 'Ricomincia la gara' : 'Ricomincia la sessione'}
              </button>
              <button onClick={() => setScreen('menu')}>Torna al menu</button>
            </div>
            <SettingsPanel settings={settings} onChange={updateSettings} gamepadName={gamepadName} />
          </div>
        </div>
      )}
    </div>
  );
}
