import type { Driver } from '../drivers/index.ts';
import { portraitSvg } from '../drivers/index.ts';
import type { RaceInfo } from '../protocol.ts';
import { lapTime } from './format.ts';

/** Semaforo di partenza: cinque luci rosse, poi "VIA!". */
export function StartLights({ race }: { race: RaceInfo }) {
  if (race.phase === 'grid' || race.phase === 'countdown') {
    return (
      <div className="start-lights">
        {[1, 2, 3, 4, 5].map((k) => (
          <div key={k} className="light-col">
            <span className={race.lights >= k ? 'on' : ''} />
            <span className={race.lights >= k ? 'on' : ''} />
          </div>
        ))}
      </div>
    );
  }
  if (race.phase === 'racing' && race.raceTime < 1.5) return <div className="start-go">VIA!</div>;
  return null;
}

function gapText(r: RaceInfo['standings'][number], leader: boolean): string {
  if (r.finished && r.finishTime !== null) return leader ? lapTime(r.finishTime) : `+${r.gap.toFixed(1)}`;
  if (leader) return `Giro ${Math.max(1, r.lap)}`;
  if (r.lapsBehind > 0) return `+${r.lapsBehind} g`;
  return `+${r.gap.toFixed(1)}`;
}

/** Classifica in tempo reale, a sinistra dello schermo. */
export function Tower({ race, drivers }: { race: RaceInfo; drivers: Driver[] }) {
  return (
    <div className="panel tower">
      {race.standings.map((r, k) => {
        const d = drivers[r.index];
        return (
          <div key={r.index} className={`tower-row ${r.index === race.focus ? 'me' : ''}`}>
            <span className="pos">{r.position}</span>
            <span className="swatch" style={{ background: d?.portrait.primary }} />
            <span className="code">{d?.name.code ?? '???'}</span>
            <span className="gap">{race.phase === 'grid' || race.phase === 'countdown' ? '' : gapText(r, k === 0)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Risultati con podio e classifica completa. */
export function Results({
  race,
  drivers,
  onRematch,
  onMenu,
  rematchLabel = 'Rivincita',
}: {
  race: RaceInfo;
  drivers: Driver[];
  onRematch: () => void;
  onMenu: () => void;
  rematchLabel?: string;
}) {
  const me = race.standings.find((r) => r.index === race.focus);
  const podium = race.standings.slice(0, 3);
  const bestLap = race.standings.reduce<number | null>((b, r) => (r.best !== null && (b === null || r.best < b) ? r.best : b), null);
  return (
    <div className="results">
      <div className="results-box">
        <h2>🏁 Bandiera a scacchi</h2>
        {me && <p className="results-me">Hai chiuso {me.position}° su {race.standings.length}</p>}
        <div className="podium">
          {[1, 0, 2].map((k) => {
            const r = podium[k];
            if (!r) return <div key={k} />;
            const d = drivers[r.index];
            return (
              <div key={k} className={`podium-step p${k + 1}`}>
                {d && <div className="podium-portrait" dangerouslySetInnerHTML={{ __html: portraitSvg(d.portrait) }} />}
                <strong>{d?.name.full}</strong>
                <div className="step">{k + 1}</div>
              </div>
            );
          })}
        </div>
        <table className="results-table">
          <tbody>
            {race.standings.map((r, k) => {
              const d = drivers[r.index];
              return (
                <tr key={r.index} className={r.index === race.focus ? 'me' : ''}>
                  <td>{r.position}</td>
                  <td>
                    <span className="swatch" style={{ background: d?.portrait.primary }} /> {d?.name.full}
                  </td>
                  <td>{r.finished ? (k === 0 ? lapTime(r.finishTime) : `+${r.gap.toFixed(3)}`) : r.lapsBehind > 0 ? `+${r.lapsBehind} giri` : 'in pista'}</td>
                  <td className={r.best !== null && r.best === bestLap ? 'best' : ''}>{lapTime(r.best)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pause-actions">
          <button className="primary" onClick={onRematch}>
            {rematchLabel}
          </button>
          <button onClick={onMenu}>Menu</button>
        </div>
      </div>
    </div>
  );
}
