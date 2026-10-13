import type { Snapshot } from '../protocol.ts';
import { delta, gearLabel, lapTime } from './format.ts';

const SHIFT_LIGHTS = 15;
const LIGHT_START = 9500;
const LIGHT_END = 12000;

function lightColor(i: number): string {
  if (i < 5) return '#2ed158';
  if (i < 10) return '#ff3b30';
  return '#5e5ce6';
}

function slipColor(s: number): string {
  if (s < 0.6) return '#2ed158';
  if (s < 0.95) return '#ffd60a';
  if (s < 1.3) return '#ff9f0a';
  return '#ff3b30';
}

export function Hud({ snap }: { snap: Snapshot }) {
  const kmh = Math.round(Math.max(0, snap.u) * 3.6);
  const lit = Math.max(0, Math.min(SHIFT_LIGHTS, Math.round(((snap.rpm - LIGHT_START) / (LIGHT_END - LIGHT_START)) * SHIFT_LIGHTS)));
  const flash = snap.rpm > LIGHT_END;
  const lap = snap.lap;
  const ers = snap.ersStore / snap.ersCapacity;
  const offTrack = snap.wheels.every((w) => w.offTrack);

  const sectors = [0, 1, 2].map((k) => {
    const cur = lap.splits[k];
    const best = lap.bestSplits[k];
    if (cur === undefined || best === undefined) return null;
    return cur - best;
  });

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="panel lap-panel">
          {snap.race.laps > 0 ? (
            <div className="race-pos">
              <span className="big">P{snap.race.standings.find((r) => r.index === snap.race.focus)?.position ?? '-'}</span>
              <span className="of">/{snap.race.standings.length}</span>
              <span className="lapcount">
                GIRO {Math.min(Math.max(lap.lap, 1), snap.race.laps)}/{snap.race.laps}
              </span>
            </div>
          ) : (
            <div className="row">
              <span className="label">GIRO</span>
              <span className="value">{lap.lap === 0 ? 'lancio' : lap.lap}</span>
            </div>
          )}
          <div className={`lap-current ${lap.currentValid ? '' : 'invalid'}`}>{lapTime(lap.lap > 0 ? lap.current : null)}</div>
          <div className="row">
            <span className="label">ULTIMO</span>
            <span className={`value ${lap.last !== null && !lap.lastValid ? 'invalid' : ''}`}>{lapTime(lap.last)}</span>
          </div>
          <div className="row">
            <span className="label">MIGLIORE</span>
            <span className="value best">{lapTime(lap.best)}</span>
          </div>
          <div className="sectors">
            {sectors.slice(0, 2).map((d, k) => (
              <span key={k} className={d === null ? '' : d <= 0 ? 'faster' : 'slower'}>
                I{k + 1} {d === null ? '' : delta(d)}
              </span>
            ))}
          </div>
          {!lap.currentValid && lap.lap > 0 && <div className="warn">GIRO NON VALIDO</div>}
        </div>
      </div>

      {offTrack && <div className="center-warn">FUORI PISTA</div>}

      <div className="hud-bottom">
        <div className="panel tyres">
          <div className="tyre-grid">
            {snap.wheels.map((w, i) => (
              <div key={i} className="tyre" style={{ background: slipColor(w.slip) }} title={`slittamento ${w.slip.toFixed(2)}`}>
                <span>{Math.round(w.fz / 100) / 10}</span>
              </div>
            ))}
          </div>
          <div className="caption">aderenza / carico kN</div>
        </div>

        <div className="panel dash">
          <div className="shift-lights">
            {Array.from({ length: SHIFT_LIGHTS }, (_, i) => (
              <span
                key={i}
                className="light"
                style={{ background: (flash ? Math.floor(performance.now() / 80) % 2 === 0 : i < lit) ? lightColor(i) : '#2a2a2e' }}
              />
            ))}
          </div>
          <div className="dash-main">
            <div className="speed">
              {kmh}
              <small>km/h</small>
            </div>
            <div className="gear">{gearLabel(snap.gear)}</div>
            <div className="rpm">
              {Math.round(snap.rpm)}
              <small>giri</small>
            </div>
          </div>
          <div className="pedals">
            <div className="bar">
              <div className="fill brake" style={{ width: `${snap.brake * 100}%` }} />
            </div>
            <div className="bar">
              <div className="fill throttle" style={{ width: `${snap.throttle * 100}%` }} />
            </div>
          </div>
          <div className="steer-bar">
            <div className="steer-mark" style={{ left: `${50 - snap.steer * 50}%` }} />
          </div>
          <div className="flags">
            <span className={snap.aeroBlend > 0.5 ? 'on aero' : ''}>{snap.aeroBlend > 0.5 ? 'AERO RETTILINEO' : 'AERO CURVA'}</span>
            <span className={snap.tcActive ? 'on tc' : ''}>TC</span>
            {snap.race.laps > 0 && <span className={snap.overtakeMode ? 'on override' : ''}>OVERRIDE</span>}
            <span className={snap.ersDeploy > 0 ? 'on deploy' : snap.ersHarvest > 0 ? 'on harvest' : ''}>
              {snap.ersDeploy > 0 ? 'ERS ▲' : snap.ersHarvest > 0 ? 'ERS ▼' : 'ERS'}
            </span>
          </div>
        </div>

        <div className="panel ers">
          <div className="caption">BATTERIA</div>
          <div className="ers-bar">
            <div className="ers-fill" style={{ height: `${ers * 100}%` }} />
          </div>
          <div className="caption">{(snap.ersStore / 1e6).toFixed(2)} MJ</div>
          <GMeter lat={snap.latG} long={snap.longG} />
        </div>
      </div>
    </div>
  );
}

function GMeter({ lat, long }: { lat: number; long: number }) {
  const r = 5;
  const x = 50 - (lat / r) * 45;
  const y = 50 - (long / r) * 45;
  return (
    <svg className="gmeter" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="45" />
      <circle cx="50" cy="50" r="27" />
      <circle cx="50" cy="50" r="9" />
      <circle className="dot" cx={x} cy={y} r="5" />
      <text x="50" y="98">
        {Math.hypot(lat, long).toFixed(1)} g
      </text>
    </svg>
  );
}
