import { TRACKS } from '@bicio/sim-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameClient, type PerfInfo } from './game/GameClient.ts';
import type { Snapshot } from './protocol.ts';
import { CAMERA_LABELS, QUALITY_LABELS } from './render/Renderer.ts';
import { TiltSteering } from './input/tilt.ts';
import { loadSettings, saveSettings, touchActive, type Settings } from './settings.ts';
import { DriversGallery } from './ui/DriversGallery.tsx';
import { Garage } from './ui/Garage.tsx';
import { Hud } from './ui/Hud.tsx';
import { SettingsPanel } from './ui/SettingsPanel.tsx';
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
    if (screen !== 'drive' || !container.current) return;
    const g = new GameClient(container.current, settings, {
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
    // La sessione si crea una volta per ingresso in pista
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  useEffect(() => {
    game.current?.setPaused(paused);
  }, [paused]);

  const touch = touchActive(settings);
  const telemetrySource = useCallback(() => game.current?.telemetry ?? [], []);

  if (screen === 'drivers') return <DriversGallery onBack={() => setScreen('menu')} />;
  if (screen === 'garage') return <Garage onBack={() => setScreen('menu')} />;

  if (screen === 'menu') {
    return (
      <div className="menu">
        <header>
          <h1>
            bicio<span>-F1</span>
          </h1>
          <p>Simulatore di Formula 1 · fase 1: prototipo di guida</p>
        </header>
        <div className="menu-body">
          <div className="menu-start">
            <h2>Guida libera</h2>
            <p>
              <select className="track-select" value={settings.trackId} onChange={(e) => updateSettings({ ...settings, trackId: e.target.value })}>
                {Object.values(TRACKS).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <br />
              <small>Vettura 2026 · aero attiva · ERS 350 kW</small>
            </p>
            <button
              className="primary"
              onClick={async () => {
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
                setPaused(false);
                setScreen('drive');
              }}
            >
              Scendi in pista
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

  return (
    <div className={`drive ${touch ? 'touch' : ''}`}>
      <div ref={container} className="viewport" />
      {snap && <Hud snap={snap} />}
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
                  setPaused(false);
                }}
              >
                Ricomincia la sessione
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
