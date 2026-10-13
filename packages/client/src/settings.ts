import { defaultAids, defaultKeyboardTuning, type Aids, type KeyboardTuning } from '@bicio/sim-core';
import { DEFAULT_GAMEPAD, type GamepadTuning } from './input/InputManager.ts';
import { DEFAULT_TILT, type TiltTuning } from './input/tilt.ts';
import type { CameraMode, QualityPreset } from './render/Renderer.ts';

export interface Settings {
  aids: Aids;
  keyboard: KeyboardTuning;
  gamepad: GamepadTuning;
  quality: QualityPreset | 'auto';
  camera: CameraMode;
  trackId: string;
  touch: TouchSettings;
}

export interface TouchSettings {
  /** Comandi sullo schermo: automatici sui dispositivi touch, sempre, mai */
  mode: 'auto' | 'on' | 'off';
  steering: 'arrows' | 'tilt';
  tilt: TiltTuning;
}

/** Vero su smartphone e tablet (puntatore principale impreciso, cioè un dito). */
export function isTouchDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function touchActive(s: Settings): boolean {
  return s.touch.mode === 'on' || (s.touch.mode === 'auto' && isTouchDevice());
}

const KEY = 'bicio-f1.settings.v1';

export function defaultSettings(): Settings {
  const aids = defaultAids();
  // Sui dispositivi touch il cambio automatico evita due pulsanti in più
  if (isTouchDevice()) aids.autoShift = true;
  return {
    aids,
    keyboard: defaultKeyboardTuning(),
    gamepad: { ...DEFAULT_GAMEPAD },
    quality: 'auto',
    camera: 'chase',
    trackId: 'riviera',
    touch: { mode: 'auto', steering: 'arrows', tilt: { ...DEFAULT_TILT } },
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
      touch: { ...d.touch, ...s.touch, tilt: { ...d.touch.tilt, ...s.touch?.tilt } },
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
