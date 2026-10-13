/**
 * Registratore di telemetria a frequenza fissa, con buffer circolare per canale.
 * Serve per tarare il realismo della guida e, più avanti, come funzione di gioco
 * (analisi dei giri e dei setup).
 */

export const TELEMETRY_CHANNELS = [
  'time',
  'lap',
  'distance',
  'speed',
  'rpm',
  'gear',
  'throttle',
  'brake',
  'steer',
  'latG',
  'longG',
  'slipRatioFL',
  'slipRatioFR',
  'slipRatioRL',
  'slipRatioRR',
  'slipAngleFL',
  'slipAngleFR',
  'slipAngleRL',
  'slipAngleRR',
  'loadFL',
  'loadFR',
  'loadRL',
  'loadRR',
  'ersStore',
  'aeroMode',
] as const;

export type TelemetryChannel = (typeof TELEMETRY_CHANNELS)[number];
export type TelemetrySample = Record<TelemetryChannel, number>;

export class TelemetryRecorder {
  readonly capacity: number;
  /** Numero totale di campioni scritti (cresce sempre; l'indice nel buffer è count % capacity) */
  count = 0;
  private readonly data: Record<TelemetryChannel, Float32Array>;

  constructor(capacity: number) {
    this.capacity = capacity;
    const data = {} as Record<TelemetryChannel, Float32Array>;
    for (const ch of TELEMETRY_CHANNELS) data[ch] = new Float32Array(capacity);
    this.data = data;
  }

  push(sample: TelemetrySample): void {
    const idx = this.count % this.capacity;
    for (const ch of TELEMETRY_CHANNELS) this.data[ch][idx] = sample[ch];
    this.count++;
  }

  /** Campioni dall'indice assoluto from (escluso il troppo vecchio) fino all'ultimo. */
  read(from: number): { from: number; samples: TelemetrySample[] } {
    const start = Math.max(from, this.count - this.capacity, 0);
    const samples: TelemetrySample[] = [];
    for (let i = start; i < this.count; i++) {
      const idx = i % this.capacity;
      const s = {} as TelemetrySample;
      for (const ch of TELEMETRY_CHANNELS) s[ch] = this.data[ch][idx];
      samples.push(s);
    }
    return { from: start, samples };
  }

  clear(): void {
    this.count = 0;
  }
}
