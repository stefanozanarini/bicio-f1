import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Action } from '../input/InputManager.ts';

interface Props {
  press: (a: Action, down: boolean) => void;
  /** Sterzo con le frecce (altrimenti a inclinazione) */
  arrows: boolean;
  shiftButtons: boolean;
  onRecenter: () => void;
}

function Pad({ action, press, className, children }: { action: Action; press: Props['press']; className: string; children: ReactNode }) {
  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.classList.add('pressed');
    press(action, true);
    try {
      // Il rilascio arriva a questo pulsante anche se il dito scivola fuori
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // puntatore non più attivo: nessuna cattura
    }
  };
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.classList.remove('pressed');
    press(action, false);
  };
  return (
    <button
      className={`touch-pad ${className}`}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/** Comandi sullo schermo per smartphone e tablet (in orizzontale). */
export function TouchControls({ press, arrows, shiftButtons, onRecenter }: Props) {
  return (
    <div className="touch-controls">
      <div className="touch-top">
        <Pad action="pause" press={press} className="small">
          ❚❚
        </Pad>
        <Pad action="camera" press={press} className="small">
          🎥
        </Pad>
        <Pad action="reset" press={press} className="small">
          ↺
        </Pad>
        {shiftButtons && (
          <>
            <Pad action="shiftDown" press={press} className="small">
              −
            </Pad>
            <Pad action="shiftUp" press={press} className="small">
              +
            </Pad>
          </>
        )}
        {!arrows && (
          <button className="touch-pad small" onPointerDown={onRecenter}>
            ⊕
          </button>
        )}
      </div>

      <div className="touch-left">
        {arrows && (
          <>
            <Pad action="left" press={press} className="steer">
              ◀
            </Pad>
            <Pad action="right" press={press} className="steer">
              ▶
            </Pad>
          </>
        )}
      </div>

      <div className="touch-right">
        <Pad action="brake" press={press} className="pedal brake">
          FRENO
        </Pad>
        <Pad action="throttle" press={press} className="pedal gas">
          GAS
        </Pad>
      </div>
    </div>
  );
}
