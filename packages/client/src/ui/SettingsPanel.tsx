import type { Settings } from '../settings.ts';
import { ACTION_LABELS, DEFAULT_BINDINGS, type Action } from '../input/InputManager.ts';
import { QUALITY_LABELS, type QualityPreset } from '../render/Renderer.ts';

function keyName(code: string): string {
  return code
    .replace(/^Key/, '')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('Space', 'Spazio')
    .replace('Escape', 'Esc');
}

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  gamepadName: string | null;
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="slider">
      <span>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output>{props.format ? props.format(props.value) : props.value.toFixed(1)}</output>
    </label>
  );
}

function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle" title={props.hint}>
      <input type="checkbox" checked={props.value} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

export function SettingsPanel({ settings, onChange, gamepadName }: Props) {
  const s = settings;
  const aids = (patch: Partial<Settings['aids']>) => onChange({ ...s, aids: { ...s.aids, ...patch } });
  const kb = (patch: Partial<Settings['keyboard']>) => onChange({ ...s, keyboard: { ...s.keyboard, ...patch } });
  const gp = (patch: Partial<Settings['gamepad']>) => onChange({ ...s, gamepad: { ...s.gamepad, ...patch } });
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="settings">
      <section>
        <h3>Aiuti alla guida</h3>
        <Toggle label="ABS" value={s.aids.abs} onChange={(v) => aids({ abs: v })} hint="Le F1 vere non hanno l'ABS" />
        <Toggle label="Controllo di trazione" value={s.aids.tractionControl} onChange={(v) => aids({ tractionControl: v })} hint="Vietato in F1 dal 2008" />
        <Toggle label="Cambio automatico" value={s.aids.autoShift} onChange={(v) => aids({ autoShift: v })} />
        <Slider
          label="Limitatore sterzo con la velocità"
          value={s.aids.steerLimit}
          min={0}
          max={1}
          step={0.05}
          format={pct}
          onChange={(v) => aids({ steerLimit: v })}
        />
        <p className="hint">Per la massima fedeltà: tutto disattivato. Con la tastiera il limitatore di sterzo è consigliato.</p>
      </section>

      <section>
        <h3>Tastiera</h3>
        <Slider label="Velocità sterzata" value={s.keyboard.steerRate} min={1} max={10} step={0.5} onChange={(v) => kb({ steerRate: v })} />
        <Slider label="Ritorno sterzo" value={s.keyboard.steerReturnRate} min={1} max={14} step={0.5} onChange={(v) => kb({ steerReturnRate: v })} />
        <Slider label="Velocità gas" value={s.keyboard.throttleRate} min={1} max={14} step={0.5} onChange={(v) => kb({ throttleRate: v })} />
        <Slider label="Velocità freno" value={s.keyboard.brakeRate} min={1} max={14} step={0.5} onChange={(v) => kb({ brakeRate: v })} />
        <Slider label="Gas parziale (Spazio)" value={s.keyboard.partialThrottle} min={0.2} max={0.9} step={0.05} format={pct} onChange={(v) => kb({ partialThrottle: v })} />
        <Slider label="Freno parziale (Spazio)" value={s.keyboard.partialBrake} min={0.2} max={0.9} step={0.05} format={pct} onChange={(v) => kb({ partialBrake: v })} />
      </section>

      <section>
        <h3>Gamepad / volante</h3>
        <p className="hint">{gamepadName ? `Collegato: ${gamepadName}` : 'Nessun gamepad rilevato: premi un tasto sul controller.'}</p>
        <Slider label="Zona morta" value={s.gamepad.deadzone} min={0} max={0.25} step={0.01} format={pct} onChange={(v) => gp({ deadzone: v })} />
        <Slider label="Curva sterzo" value={s.gamepad.steerGamma} min={1} max={3} step={0.1} onChange={(v) => gp({ steerGamma: v })} />
        <Slider label="Saturazione sterzo" value={s.gamepad.steerSaturation} min={0.5} max={1} step={0.01} format={pct} onChange={(v) => gp({ steerSaturation: v })} />
        <p className="hint">Grilletto destro: gas · sinistro: freno · RB/A: marcia su · LB/X: marcia giù · Y: visuale · B: telemetria · Back: rimetti in pista · Start: pausa</p>
      </section>

      <section>
        <h3>Grafica</h3>
        <select value={s.quality} onChange={(e) => onChange({ ...s, quality: e.target.value as Settings['quality'] })}>
          <option value="auto">Automatica</option>
          {(Object.keys(QUALITY_LABELS) as QualityPreset[]).map((q) => (
            <option key={q} value={q}>
              {QUALITY_LABELS[q]}
            </option>
          ))}
        </select>
        <p className="hint">La qualità grafica si applica alla prossima sessione. La fisica è sempre identica, su qualunque hardware.</p>
      </section>

      <section>
        <h3>Comandi da tastiera</h3>
        <table className="keys">
          <tbody>
            {(Object.keys(ACTION_LABELS) as Action[]).map((a) => (
              <tr key={a}>
                <td>{ACTION_LABELS[a]}</td>
                <td>
                  {DEFAULT_BINDINGS[a].map((c) => (
                    <kbd key={c}>{keyName(c)}</kbd>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
