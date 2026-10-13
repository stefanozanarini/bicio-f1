import { defaultCar2026, TEST_TRACK, Track, type TelemetrySample } from '@bicio/sim-core';
import { InputManager } from '../input/InputManager.ts';
import type { FromWorker, Snapshot, ToWorker } from '../protocol.ts';
import { detectQuality, Renderer, type CameraMode, type QualityPreset } from '../render/Renderer.ts';
import type { Settings } from '../settings.ts';

export interface GameCallbacks {
  onHud(snap: Snapshot): void;
  onPauseRequest(): void;
  /** La pagina non è più visibile: la sessione va messa in pausa */
  onHidden(): void;
  onCamera(mode: CameraMode): void;
  onToggleTelemetry(): void;
  onPerf(info: PerfInfo): void;
  onNotice(text: string): void;
}

export interface PerfInfo {
  fps: number;
  physicsHz: number;
  physicsLoad: number;
  quality: QualityPreset;
}

const LOWER: Record<QualityPreset, QualityPreset> = { ultra: 'high', high: 'medium', medium: 'low', low: 'low' };
const TELEMETRY_KEEP = 50 * 60;

/**
 * Collega input, worker della simulazione e renderer. Vive per tutta una sessione di guida.
 */
export class GameClient {
  readonly telemetry: TelemetrySample[] = [];
  private readonly worker: Worker;
  private readonly input = new InputManager();
  private readonly track = new Track(TEST_TRACK);
  private renderer: Renderer;
  private settings: Settings;
  private prev: Snapshot | null = null;
  private curr: Snapshot | null = null;
  private prevRecv = 0;
  private currRecv = 0;
  private raf = 0;
  private lastFrame = 0;
  private lastHud = 0;
  private paused = false;
  private frames = 0;
  private fpsStart = 0;
  private lowFpsSeconds = 0;
  private physicsHz = 0;
  private physicsLoad = 0;

  constructor(
    private readonly container: HTMLElement,
    settings: Settings,
    private readonly cb: GameCallbacks,
  ) {
    this.settings = settings;
    this.renderer = this.makeRenderer(settings.quality === 'auto' ? detectQuality() : settings.quality);
    this.renderer.cameraMode = settings.camera;
    this.input.gamepad = settings.gamepad;
    this.input.onAction = (a) => {
      if (a === 'camera') this.cb.onCamera(this.renderer.cycleCamera());
      else if (a === 'telemetry') this.cb.onToggleTelemetry();
      else if (a === 'reset') this.send({ type: 'reset' });
      else if (a === 'pause') this.cb.onPauseRequest();
    };

    this.worker = new Worker(new URL('../sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onWorker(ev.data);
    this.send({ type: 'start', trackId: TEST_TRACK.id, aids: settings.aids, keyboard: settings.keyboard });

    document.addEventListener('visibilitychange', this.onVisibility);

    this.lastFrame = performance.now();
    this.fpsStart = this.lastFrame;
    this.raf = requestAnimationFrame(this.frame);
  }

  get gamepadName(): string | null {
    return this.input.gamepadName;
  }

  /** Con la pagina nascosta il browser ferma il rendering e gli input: si va in pausa. */
  private onVisibility = () => {
    if (document.hidden) this.cb.onHidden();
  };

  private makeRenderer(q: QualityPreset): Renderer {
    return new Renderer(this.container, this.track, defaultCar2026(), q);
  }

  private send(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  private onWorker(msg: FromWorker): void {
    if (msg.type === 'snapshot') {
      this.prev = this.curr;
      this.prevRecv = this.currRecv;
      this.curr = msg.snap;
      this.currRecv = performance.now();
      if (msg.telemetry.length) {
        this.telemetry.push(...msg.telemetry);
        if (this.telemetry.length > TELEMETRY_KEEP) this.telemetry.splice(0, this.telemetry.length - TELEMETRY_KEEP);
      }
    } else if (msg.type === 'perf') {
      this.physicsHz = msg.stepsPerSecond;
      this.physicsLoad = msg.loadPercent;
    }
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (!this.paused) this.send({ type: 'input', input: this.input.poll() });

    if (this.curr) {
      // Interpolazione tra gli ultimi due snapshot (ritardo di uno snapshot, ~8 ms)
      const span = this.currRecv - this.prevRecv;
      const alpha = this.prev && span > 0 ? Math.min(1, (now - this.currRecv) / span) : 1;
      this.renderer.render(this.prev, this.curr, alpha, dt);
      if (now - this.lastHud > 50) {
        this.lastHud = now;
        this.cb.onHud(this.curr);
      }
    }

    this.frames++;
    if (now - this.fpsStart >= 1000) {
      const fps = (this.frames * 1000) / (now - this.fpsStart);
      this.frames = 0;
      this.fpsStart = now;
      this.cb.onPerf({ fps, physicsHz: this.physicsHz, physicsLoad: this.physicsLoad, quality: this.renderer.quality });
      this.autoQuality(fps);
    }
  };

  /** Con preset "auto", se il frame rate resta basso si passa al preset inferiore. */
  private autoQuality(fps: number): void {
    if (this.settings.quality !== 'auto' || this.paused) return;
    this.lowFpsSeconds = fps < 35 ? this.lowFpsSeconds + 1 : 0;
    if (this.lowFpsSeconds >= 4 && this.renderer.quality !== 'low') {
      const next = LOWER[this.renderer.quality];
      const cam = this.renderer.cameraMode;
      this.renderer.dispose();
      this.renderer = this.makeRenderer(next);
      this.renderer.cameraMode = cam;
      this.lowFpsSeconds = 0;
      this.cb.onNotice(`Frame rate basso: qualità grafica ridotta a "${next}"`);
    }
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.send({ type: 'pause', paused: p });
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.input.gamepad = s.gamepad;
    this.send({ type: 'settings', aids: s.aids, keyboard: s.keyboard });
  }

  restart(): void {
    this.telemetry.length = 0;
    this.send({ type: 'restart' });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.worker.terminate();
    this.input.dispose();
    this.renderer.dispose();
  }
}
