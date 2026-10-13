import type { Car } from './car.ts';
import type { Aids, Controls } from './controls.ts';
import { abs, atan, clamp, cos, max, min, sin } from './dmath.ts';
import { speedProfile, type RacingLine } from './racingLine.ts';

/**
 * Aiuti alla guida che agiscono sui comandi già filtrati, prima della fisica:
 * controllo di stabilità e frenata assistita. Deterministici come il resto della simulazione.
 */
export class DrivingAssists {
  private idx = -1;
  private profile: Float64Array | null = null;

  constructor(private readonly line: RacingLine | null, car: Car) {
    // Profilo prudente: un po' sotto il limite, così l'aiuto frena in anticipo
    if (line) this.profile = speedProfile(line, car.params, { gripFactor: 0.9, brakeFactor: 0.8 });
  }

  reset(): void {
    this.idx = -1;
  }

  apply(ctl: Controls, car: Car, aids: Aids): void {
    const u = car.u;
    if (this.line && (aids.brakingAssist > 0 || aids.steerAssist > 0)) this.idx = this.line.nearest(car.x, car.y, this.idx);
    // --- Guida assistita: sterzo verso la traiettoria ideale (inseguimento puro, come i piloti automatici).
    // Lo sterzo del giocatore conta sempre almeno per metà: si può sorpassare o cambiare linea.
    if (aids.steerAssist > 0 && this.line && u > 1) {
      const line = this.line;
      const look = clamp(6 + u * 0.33, 7, 42);
      const ti = (this.idx + Math.floor(look / line.track.spacing)) % line.count;
      const c = cos(car.heading);
      const s = sin(car.heading);
      const dx = (line.x[ti] - car.x) * c + (line.y[ti] - car.y) * s;
      const dy = -(line.x[ti] - car.x) * s + (line.y[ti] - car.y) * c;
      const k = (2 * dy) / max(dx * dx + dy * dy, 1);
      const auto = clamp(atan(car.params.chassis.wheelbase * k) / car.params.chassis.maxSteerAngle, -1, 1);
      const a = clamp(aids.steerAssist, 0, 1);
      ctl.steer = clamp(ctl.steer * (1 - 0.5 * a) + auto * a, -1, 1);
    }
    // --- Controllo di stabilità: angolo di deriva del corpo vettura
    if (aids.stability > 0 && u > 4) {
      const beta = atan(car.v / u);
      const excess = abs(beta) - 0.05;
      if (excess > 0) {
        // Ruote allineate alla direzione di marcia (controsterzo) e meno gas
        const counter = (beta / car.params.chassis.maxSteerAngle) * 0.9 * aids.stability;
        ctl.steer = clamp(ctl.steer + counter, -1, 1);
        ctl.throttle *= max(0, 1 - excess * 12 * aids.stability);
      }
      // Imbardata eccessiva rispetto alla sterzata: freno al sovrasterzo
      const rSteady = (u * ctl.steer * car.params.chassis.maxSteerAngle) / car.params.chassis.wheelbase;
      const yawExcess = abs(car.r) - abs(rSteady) - 0.15;
      if (yawExcess > 0 && car.r * rSteady >= 0) ctl.throttle *= max(0, 1 - yawExcess * 2 * aids.stability);
    }
    // --- Frenata assistita: velocità oltre il profilo prudente della traiettoria
    if (aids.brakingAssist > 0 && this.line && this.profile) {
      const line = this.line;
      const ahead = (this.idx + Math.floor((6 + u * 0.15) / line.track.spacing)) % line.count;
      const target = this.profile[ahead];
      const over = u - target;
      if (over > 1) {
        const b = clamp((over - 1) / 6, 0, 1) * aids.brakingAssist;
        ctl.brake = max(ctl.brake, b);
        ctl.throttle = min(ctl.throttle, 1 - b);
      }
    }
  }
}
