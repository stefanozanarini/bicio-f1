import { aidsForLevel, type DrivingLevel } from '@bicio/sim-core';
import { isTouchDevice, type Settings } from '../settings.ts';
import { TiltSteering } from '../input/tilt.ts';
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
  // Toccare un singolo aiuto passa al livello personalizzato
  const aids = (patch: Partial<Settings['aids']>) => onChange({ ...s, drivingLevel: 'personalizzato', aids: { ...s.aids, ...patch } });
  const kb = (patch: Partial<Settings['keyboard']>) => onChange({ ...s, keyboard: { ...s.keyboard, ...patch } });
  const gp = (patch: Partial<Settings['gamepad']>) => onChange({ ...s, gamepad: { ...s.gamepad, ...patch } });
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="settings">
      <section>
        <h3>Aiuti alla guida</h3>
        <DrivingLevelSelect settings={s} onChange={onChange} />
        <Toggle label="Rientro automatico in pista" value={s.aids.autoRecover} onChange={(v) => aids({ autoRecover: v })} hint="Dopo un'uscita lunga, un testacoda o se resti fermo fuori pista" />
        <Toggle label="Erba indulgente" value={s.aids.forgivingGrass} onChange={(v) => aids({ forgivingGrass: v })} hint="Fuori pista l'auto non si pianta e non si gira così facilmente" />
        <Slider label="Controllo di stabilità" value={s.aids.stability} min={0} max={1} step={0.25} format={pct} onChange={(v) => aids({ stability: v })} />
        <Slider label="Guida assistita" value={s.aids.steerAssist} min={0} max={1} step={0.25} format={pct} onChange={(v) => aids({ steerAssist: v })} />
        <Slider label="Frenata assistita" value={s.aids.brakingAssist} min={0} max={1} step={0.25} format={pct} onChange={(v) => aids({ brakingAssist: v })} />
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
        <p className="hint">La fisica è sempre la stessa: cambiano solo gli aiuti. "Simulazione" è la guida vera, senza aiuti.</p>
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
        <h3>Comandi touch</h3>
        <label className="slider">
          <span>Pulsanti sullo schermo</span>
          <select value={s.touch.mode} onChange={(e) => onChange({ ...s, touch: { ...s.touch, mode: e.target.value as Settings['touch']['mode'] } })}>
            <option value="auto">Automatici{isTouchDevice() ? ' (attivi)' : ''}</option>
            <option value="on">Sempre</option>
            <option value="off">Mai</option>
          </select>
        </label>
        <label className="slider">
          <span>Sterzo</span>
          <select
            value={s.touch.steering}
            onChange={async (e) => {
              const steering = e.target.value as Settings['touch']['steering'];
              // Su iPhone il permesso per i sensori si chiede su un gesto dell'utente
              if (steering === 'tilt' && !(await TiltSteering.requestPermission())) return;
              onChange({ ...s, touch: { ...s.touch, steering } });
            }}
          >
            <option value="arrows">Frecce</option>
            <option value="tilt">Inclinazione del telefono</option>
          </select>
        </label>
        {s.touch.steering === 'tilt' && (
          <>
            <Slider
              label="Inclinazione per sterzo pieno"
              value={s.touch.tilt.maxAngle}
              min={10}
              max={45}
              step={1}
              format={(v) => `${v}°`}
              onChange={(v) => onChange({ ...s, touch: { ...s.touch, tilt: { ...s.touch.tilt, maxAngle: v } } })}
            />
            <Toggle
              label="Inverti direzione"
              value={s.touch.tilt.invert}
              onChange={(v) => onChange({ ...s, touch: { ...s.touch, tilt: { ...s.touch.tilt, invert: v } } })}
            />
          </>
        )}
        <p className="hint">Con l'inclinazione tieni il telefono come un volante; il pulsante ⊕ ricentra lo sterzo. Il cambio automatico è consigliato.</p>
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

export const LEVEL_LABELS: Record<Settings['drivingLevel'], string> = {
  bicio: 'Bicio',
  facile: 'Facile',
  medio: 'Medio',
  simulazione: 'Simulazione',
  personalizzato: 'Personalizzato',
};

/** Scelta del livello di guida: imposta tutti gli aiuti in un colpo solo. */
const LEVEL_HINTS: Record<Settings['drivingLevel'], string> = {
  bicio: 'Il più semplice: lo sterzo segue da solo la traiettoria, basta dare gas',
  facile: 'Frenata assistita, controllo di stabilità, erba indulgente, rientro in pista',
  medio: 'Stabilità parziale, ABS, controllo di trazione, cambio automatico',
  simulazione: 'Nessun aiuto: la guida vera di una F1',
  personalizzato: 'Aiuti scelti uno per uno',
};

/** Scelta del livello di guida: imposta tutti gli aiuti in un colpo solo. */
export function DrivingLevelSelect({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  return (
    <>
      <select
        className="track-select"
        value={settings.drivingLevel}
        onChange={(e) => {
          const level = e.target.value as Settings['drivingLevel'];
          onChange({ ...settings, drivingLevel: level, aids: level === 'personalizzato' ? settings.aids : aidsForLevel(level as DrivingLevel) });
        }}
      >
        {(Object.keys(LEVEL_LABELS) as Settings['drivingLevel'][]).map((l) => (
          <option key={l} value={l}>
            {LEVEL_LABELS[l]}
          </option>
        ))}
      </select>
      <small className="level-hint">{LEVEL_HINTS[settings.drivingLevel]}</small>
    </>
  );
}
