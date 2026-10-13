import { emptyInput, type RawInput } from '@bicio/sim-core';
import { TiltSteering } from './tilt.ts';

export type Action =
  | 'throttle'
  | 'brake'
  | 'left'
  | 'right'
  | 'partial'
  | 'shiftUp'
  | 'shiftDown'
  | 'camera'
  | 'telemetry'
  | 'reset'
  | 'pause';

export type Bindings = Record<Action, string[]>;

/** Comandi da tastiera di default (KeyboardEvent.code, indipendente dal layout). */
export const DEFAULT_BINDINGS: Bindings = {
  throttle: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  partial: ['Space'],
  shiftUp: ['KeyE', 'KeyX'],
  shiftDown: ['KeyQ', 'KeyZ'],
  camera: ['KeyC'],
  telemetry: ['KeyT'],
  reset: ['KeyR'],
  pause: ['Escape', 'KeyP'],
};

export const ACTION_LABELS: Record<Action, string> = {
  throttle: 'Acceleratore',
  brake: 'Freno',
  left: 'Sterza a sinistra',
  right: 'Sterza a destra',
  partial: 'Dosaggio parziale (gas/freno ridotti)',
  shiftUp: 'Marcia su',
  shiftDown: 'Marcia giù',
  camera: 'Cambia visuale',
  telemetry: 'Telemetria',
  reset: 'Rimetti in pista',
  pause: 'Pausa',
};

export interface GamepadTuning {
  deadzone: number;
  /** Esponente della curva dello sterzo (1 = lineare) */
  steerGamma: number;
  /** Frazione della corsa dello stick per lo sterzo pieno */
  steerSaturation: number;
}

export const DEFAULT_GAMEPAD: GamepadTuning = { deadzone: 0.06, steerGamma: 1.6, steerSaturation: 0.95 };

type OneShot = 'camera' | 'telemetry' | 'reset' | 'pause';

/**
 * Legge tastiera e gamepad e produce il RawInput per la simulazione.
 * Il filtraggio (rampe, limitazione dello sterzo) avviene nella simulazione.
 */
export class InputManager {
  bindings: Bindings = DEFAULT_BINDINGS;
  gamepad: GamepadTuning = DEFAULT_GAMEPAD;
  gamepadName: string | null = null;
  onAction: (a: OneShot) => void = () => {};

  private readonly down = new Set<string>();
  /** Tasti virtuali premuti sullo schermo touch */
  private readonly virtual = new Set<Action>();
  readonly tilt = new TiltSteering();
  /** Sterzo a inclinazione al posto delle frecce */
  tiltEnabled = false;
  /** Cambiate premute e rilasciate tra due invii: non vanno perse */
  private latchedUp = false;
  private latchedDown = false;
  private prevButtons: boolean[] = [];
  private readonly codeToAction = new Map<string, Action>();

  constructor() {
    this.rebuildMap();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.tilt.stop();
  }

  rebuildMap(): void {
    this.codeToAction.clear();
    for (const [action, codes] of Object.entries(this.bindings) as [Action, string[]][]) {
      for (const c of codes) this.codeToAction.set(c, action);
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const action = this.codeToAction.get(e.code);
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;
    this.down.add(e.code);
    if (action === 'shiftUp') this.latchedUp = true;
    if (action === 'shiftDown') this.latchedDown = true;
    if (action === 'camera' || action === 'telemetry' || action === 'reset' || action === 'pause') this.onAction(action);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private onBlur = () => {
    this.down.clear();
    this.virtual.clear();
  };

  /** Pulsanti sullo schermo touch: si comportano come i tasti della tastiera. */
  setVirtual(action: Action, pressed: boolean): void {
    if (pressed) {
      if (this.virtual.has(action)) return;
      this.virtual.add(action);
      if (action === 'shiftUp') this.latchedUp = true;
      if (action === 'shiftDown') this.latchedDown = true;
      if (action === 'camera' || action === 'telemetry' || action === 'reset' || action === 'pause') this.onAction(action);
    } else {
      this.virtual.delete(action);
    }
  }

  private held(action: Action): boolean {
    if (this.virtual.has(action)) return true;
    for (const c of this.bindings[action]) if (this.down.has(c)) return true;
    return false;
  }

  /** Da chiamare una volta per frame: legge lo stato e azzera le cambiate "agganciate". */
  poll(): RawInput {
    const input = emptyInput();
    input.throttleKey = this.held('throttle');
    input.brakeKey = this.held('brake');
    input.steerLeft = this.held('left');
    input.steerRight = this.held('right');
    input.partialKey = this.held('partial');
    input.shiftUp = this.held('shiftUp') || this.latchedUp;
    input.shiftDown = this.held('shiftDown') || this.latchedDown;
    this.latchedUp = false;
    this.latchedDown = false;
    if (this.tiltEnabled && this.tilt.active && Math.abs(this.tilt.value) > 0.001) input.steerAxis = this.tilt.value;
    this.pollGamepad(input);
    return input;
  }

  private pollGamepad(input: RawInput): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) {
      pad = p;
      break;
    }
    this.gamepadName = pad ? pad.id : null;
    if (!pad) return;
    const t = this.gamepad;

    const x = pad.axes[0] ?? 0;
    const ax = Math.abs(x);
    if (ax > t.deadzone) {
      const n = Math.min(1, (ax - t.deadzone) / (t.steerSaturation - t.deadzone));
      // Asse X: -1 = sinistra. Nella simulazione positivo = sinistra.
      input.steerAxis = -Math.sign(x) * Math.pow(n, t.steerGamma);
    }
    const trigger = (b: GamepadButton | undefined) => {
      const v = b ? b.value : 0;
      return v > t.deadzone ? (v - t.deadzone) / (1 - t.deadzone) : 0;
    };
    input.throttleAxis = trigger(pad.buttons[7]);
    input.brakeAxis = trigger(pad.buttons[6]);

    const pressed = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => pressed[i] && !this.prevButtons[i];
    input.shiftUp = input.shiftUp || pressed[5] || pressed[0];
    input.shiftDown = input.shiftDown || pressed[4] || pressed[2];
    if (edge(3)) this.onAction('camera');
    if (edge(1)) this.onAction('telemetry');
    if (edge(8)) this.onAction('reset');
    if (edge(9)) this.onAction('pause');
    this.prevButtons = pressed;
  }
}
