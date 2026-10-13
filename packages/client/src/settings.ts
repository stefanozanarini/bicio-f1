import { defaultAids, defaultKeyboardTuning, type Aids, type KeyboardTuning } from '@bicio/sim-core';
import { DEFAULT_GAMEPAD, type GamepadTuning } from './input/InputManager.ts';
import type { CameraMode, QualityPreset } from './render/Renderer.ts';

export interface Settings {
  aids: Aids;
  keyboard: KeyboardTuning;
  gamepad: GamepadTuning;
  quality: QualityPreset | 'auto';
  camera: CameraMode;
  trackId: string;
}

const KEY = 'bicio-f1.settings.v1';

export function defaultSettings(): Settings {
  return {
    aids: defaultAids(),
    keyboard: defaultKeyboardTuning(),
    gamepad: { ...DEFAULT_GAMEPAD },
    quality: 'auto',
    camera: 'chase',
    trackId: 'riviera',
  };
}

/** Preferenze del singolo giocatore (in fase 4 si salveranno anche nel profilo sul server). */
export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      aids: { ...d.aids, ...s.aids },
      keyboard: { ...d.keyboard, ...s.keyboard },
      gamepad: { ...d.gamepad, ...s.gamepad },
      quality: s.quality ?? d.quality,
      camera: s.camera ?? d.camera,
      trackId: s.trackId ?? d.trackId,
    };
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // archiviazione non disponibile (navigazione privata): le impostazioni valgono per la sessione
  }
}
