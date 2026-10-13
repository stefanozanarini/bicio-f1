/** Tempo sul giro nel formato m:ss.mmm */
export function lapTime(t: number | null | undefined): string {
  if (t === null || t === undefined || !Number.isFinite(t)) return '-:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

export function delta(t: number): string {
  return `${t >= 0 ? '+' : '−'}${Math.abs(t).toFixed(3)}`;
}

export function gearLabel(g: number): string {
  return g < 0 ? 'R' : String(g);
}
