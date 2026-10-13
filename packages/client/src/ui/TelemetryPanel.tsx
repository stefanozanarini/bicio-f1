import type { TelemetrySample } from '@bicio/sim-core';
import { useEffect, useRef } from 'react';

interface Trace {
  key: keyof TelemetrySample;
  color: string;
}

interface Row {
  title: string;
  min: number;
  max: number;
  traces: Trace[];
  /** Linee di riferimento (es. slittamento di picco) */
  marks?: number[];
}

const ROWS: Row[] = [
  { title: 'Velocità km/h', min: 0, max: 360, traces: [{ key: 'speed', color: '#64d2ff' }] },
  {
    title: 'Gas / Freno',
    min: 0,
    max: 1,
    traces: [
      { key: 'throttle', color: '#30d158' },
      { key: 'brake', color: '#ff453a' },
    ],
  },
  { title: 'Sterzo °', min: -16, max: 16, traces: [{ key: 'steer', color: '#ffd60a' }], marks: [0] },
  {
    title: 'Slittamento long. post. (sx/dx)',
    min: -0.3,
    max: 0.3,
    traces: [
      { key: 'slipRatioRL', color: '#bf5af2' },
      { key: 'slipRatioRR', color: '#ff9f0a' },
    ],
    marks: [0.09, -0.09],
  },
  {
    title: 'Deriva ° (ant. sx / post. sx)',
    min: -10,
    max: 10,
    traces: [
      { key: 'slipAngleFL', color: '#64d2ff' },
      { key: 'slipAngleRL', color: '#ff375f' },
    ],
    marks: [5.5, -5.5],
  },
  {
    title: 'Accelerazioni g (lat / long)',
    min: -5,
    max: 5,
    traces: [
      { key: 'latG', color: '#30d158' },
      { key: 'longG', color: '#ff9f0a' },
    ],
    marks: [0],
  },
];

const WINDOW_SECONDS = 15;
const SAMPLES = WINDOW_SECONDS * 50;

/**
 * Telemetria in tempo reale (tasto T): ultimi 15 secondi dei canali principali.
 * Le linee tratteggiate indicano lo slittamento e la deriva di picco delle gomme.
 */
export function TelemetryPanel({ source }: { source: () => TelemetrySample[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const c = canvas.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== w * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const all = source();
      const data = all.slice(-SAMPLES);
      const rowH = h / ROWS.length;
      ctx.font = '11px system-ui, sans-serif';
      ROWS.forEach((row, ri) => {
        const top = ri * rowH;
        const y = (v: number) => top + rowH - 4 - ((v - row.min) / (row.max - row.min)) * (rowH - 18);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(0, top + 14, w, rowH - 16);
        ctx.fillStyle = '#c7c7cc';
        ctx.fillText(row.title, 6, top + 11);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.setLineDash([4, 4]);
        for (const m of row.marks ?? []) {
          ctx.beginPath();
          ctx.moveTo(0, y(m));
          ctx.lineTo(w, y(m));
          ctx.stroke();
        }
        ctx.setLineDash([]);
        for (const tr of row.traces) {
          ctx.strokeStyle = tr.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          data.forEach((s, i) => {
            const x = w - ((data.length - 1 - i) / (SAMPLES - 1)) * w;
            const v = Math.max(row.min, Math.min(row.max, s[tr.key]));
            if (i === 0) ctx.moveTo(x, y(v));
            else ctx.lineTo(x, y(v));
          });
          ctx.stroke();
        }
        const last = data[data.length - 1];
        if (last) {
          ctx.textAlign = 'right';
          row.traces.forEach((tr, k) => {
            ctx.fillStyle = tr.color;
            ctx.fillText(last[tr.key].toFixed(Math.abs(row.max) < 2 ? 2 : 0), w - 6 - k * 56, top + 11);
          });
          ctx.textAlign = 'left';
        }
      });
    }, 66);
    return () => window.clearInterval(id);
  }, [source]);

  return (
    <div className="panel telemetry">
      <canvas ref={canvas} />
    </div>
  );
}
