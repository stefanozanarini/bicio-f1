/**
 * Sterzo a inclinazione per smartphone e tablet, tenuti in orizzontale come un volante.
 *
 * Legge la gravità dall'accelerometro, la riporta nel riferimento dello schermo
 * (tenendo conto della rotazione) e misura l'angolo di rotazione nel piano dello
 * schermo rispetto alla posizione di riferimento presa all'avvio ("ricentra").
 */

export interface TiltTuning {
  /** Inclinazione per lo sterzo pieno [gradi] */
  maxAngle: number;
  /** Zona morta attorno al centro [gradi] */
  deadzone: number;
  invert: boolean;
}

export const DEFAULT_TILT: TiltTuning = { maxAngle: 28, deadzone: 1.5, invert: false };

const IOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

type PermissionFn = () => Promise<'granted' | 'denied'>;

export class TiltSteering {
  tuning: TiltTuning = DEFAULT_TILT;
  /** Valore di sterzo -1..1, positivo a sinistra */
  value = 0;
  active = false;
  private angle = 0;
  private center: number | null = null;

  static supported(): boolean {
    return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  }

  /** Su iOS il permesso va chiesto in risposta a un tocco dell'utente. */
  static async requestPermission(): Promise<boolean> {
    const dm = (window as unknown as { DeviceMotionEvent?: { requestPermission?: PermissionFn } }).DeviceMotionEvent;
    if (dm && typeof dm.requestPermission === 'function') {
      try {
        return (await dm.requestPermission()) === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.center = null;
    window.addEventListener('devicemotion', this.onMotion);
  }

  stop(): void {
    this.active = false;
    this.value = 0;
    window.removeEventListener('devicemotion', this.onMotion);
  }

  /** La posizione attuale diventa "sterzo dritto". */
  recenter(): void {
    this.center = this.angle;
  }

  private onMotion = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x === null || g.y === null) return;
    let gx = g.x;
    let gy = g.y;
    if (IOS) {
      gx = -gx;
      gy = -gy;
    }
    // Riporta il vettore nel riferimento dello schermo ruotato
    const rot = ((screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) * Math.PI) / 180;
    const sx = gx * Math.cos(rot) + gy * Math.sin(rot);
    const sy = -gx * Math.sin(rot) + gy * Math.cos(rot);
    this.angle = (Math.atan2(sx, sy) * 180) / Math.PI;
    if (this.center === null) this.center = this.angle;
    let d = this.angle - this.center;
    d -= 360 * Math.round(d / 360);
    const t = this.tuning;
    const mag = Math.max(0, Math.abs(d) - t.deadzone) / (t.maxAngle - t.deadzone);
    // Ruotando il telefono in senso antiorario (come un volante verso sinistra) si sterza a sinistra
    let v = Math.sign(d) * Math.min(1, mag);
    if (t.invert) v = -v;
    this.value = v;
  };
}
