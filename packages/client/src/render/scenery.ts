import { Surface, type Track, type TrackQuery } from '@bicio/sim-core';
import * as THREE from 'three';
import { LOCALITA, sponsors } from '../scenery/data.ts';
import { fitText, panelTexture, seeded, stripesTexture } from './textures.ts';

/**
 * Scenografia romagnola lungo il circuito: baracchine della piadina, cartelli delle
 * località e cartelloni pubblicitari. Solo grafica: nessun effetto sulla fisica.
 * Ogni oggetto è costruito con il fronte verso +z locale.
 */

type Rng = () => number;
const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

const lambert = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// ---------- Baracchina della piadina ----------

const KIOSK_COLORS: [string, string][] = [
  ['#c8102e', '#ffffff'],
  ['#1f7a3a', '#ffffff'],
  ['#0b4ea2', '#ffffff'],
  ['#f2a900', '#ffffff'],
];

const KIOSK_NAMES = ['Da Bruna', 'La Teglia', 'Al Passatore', 'Dalla Pina', 'La Rustida', 'Da Gigiòn', 'Il Mattarello', 'La Piè'];

function kiosk(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const [c1, c2] = pick(r, KIOSK_COLORS);
  const stripes = stripesTexture(c1, c2, 10);
  stripes.repeat.set(1, 1);
  const walls = new THREE.MeshLambertMaterial({ map: stripes });
  const white = lambert('#f4f1ea');

  // Corpo a righe verticali, tetto sporgente, bancone
  g.add(box(4.2, 2.5, 2.6, walls, 0, 1.25, 0));
  g.add(box(4.8, 0.18, 3.3, white, 0, 2.6, 0.2));
  g.add(box(4.2, 1.0, 0.5, white, 0, 0.5, 1.5));
  // Apertura scura sopra il bancone
  g.add(box(3.4, 1.0, 0.05, lambert('#3b2a1e'), 0, 1.6, 1.31));

  // Tendina a righe inclinata
  const awningTex = stripesTexture(c1, c2, 12);
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.2), new THREE.MeshLambertMaterial({ map: awningTex, side: THREE.DoubleSide }));
  awning.position.set(0, 2.3, 1.85);
  awning.rotation.x = -0.9;
  g.add(awning);

  // Insegna sul tetto
  const name = pick(r, KIOSK_NAMES);
  const signTex = panelTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = c1;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = c1;
    fitText(ctx, 'PIADINA', w / 2, h * 0.38, w - 40, 64, '900', 'Georgia, serif');
    ctx.fillStyle = '#333';
    fitText(ctx, `${name} · crescioni · cassoni`, w / 2, h * 0.76, w - 40, 26, '600');
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(0, 3.3, 1.2);
  g.add(sign);
  g.add(box(4.5, 1.15, 0.1, white, 0, 3.3, 1.13));

  // Tavolini con ombrellone
  for (const x of [-4.5, 4.8]) {
    const t = new THREE.Group();
    t.add(box(0.9, 0.05, 0.9, white, 0, 0.75, 0));
    t.add(box(0.08, 0.75, 0.08, lambert('#777'), 0, 0.375, 0));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), lambert('#777'));
    pole.position.y = 1.15;
    t.add(pole);
    const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 8, 1, true), new THREE.MeshLambertMaterial({ color: c1, side: THREE.DoubleSide }));
    umbrella.position.y = 2.3;
    t.add(umbrella);
    t.position.set(x, 0, 2.5 + r() * 1.5);
    g.add(t);
  }
  return g;
}

// ---------- Cartelli stradali ----------

/** Cartello di località: bianco con bordo nero, come i cartelli d'inizio centro abitato. */
function townSign(name: string): THREE.Group {
  const g = new THREE.Group();
  const tex = panelTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 12;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = '#111';
    fitText(ctx, name, w / 2, h / 2 + 4, w - 70, 78, 'bold');
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshBasicMaterial({ map: tex }));
  panel.position.y = 2.2;
  g.add(panel);
  g.add(box(3.25, 1.05, 0.04, lambert('#9a9a9a'), 0, 2.2, -0.03));
  for (const x of [-1.2, 1.2]) g.add(box(0.07, 2.2, 0.07, lambert('#8a8a8a'), x, 1.1, -0.06));
  return g;
}

/** Cartello di direzione blu con freccia e distanza. */
function directionSign(name: string, km: number, left: boolean): THREE.Group {
  const g = new THREE.Group();
  const tex = panelTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1550a8';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#fff';
    // Freccia
    ctx.beginPath();
    if (left) {
      ctx.moveTo(30, h / 2);
      ctx.lineTo(80, h / 2 - 34);
      ctx.lineTo(80, h / 2 + 34);
    } else {
      ctx.moveTo(w - 30, h / 2);
      ctx.lineTo(w - 80, h / 2 - 34);
      ctx.lineTo(w - 80, h / 2 + 34);
    }
    ctx.fill();
    fitText(ctx, `${name}  ${km}`, w / 2, h / 2 + 3, w - 200, 56, 'bold');
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: tex }));
  panel.position.y = 2.4;
  g.add(panel);
  g.add(box(3.65, 0.95, 0.04, lambert('#9a9a9a'), 0, 2.4, -0.03));
  g.add(box(0.08, 2.4, 0.08, lambert('#8a8a8a'), 0, 1.2, -0.07));
  return g;
}

// ---------- Cartelloni pubblicitari ----------

const BILLBOARD_STYLES: { bg: string; fg: string; accent: string }[] = [
  { bg: '#0d2c6b', fg: '#ffffff', accent: '#ffcc00' },
  { bg: '#ffcc00', fg: '#111111', accent: '#d0021b' },
  { bg: '#d0021b', fg: '#ffffff', accent: '#ffffff' },
  { bg: '#111111', fg: '#ffffff', accent: '#2ee6c8' },
  { bg: '#f4f4f4', fg: '#0d2c6b', accent: '#ff7a00' },
  { bg: '#1f7a3a', fg: '#ffffff', accent: '#ffe066' },
];

function billboard(brand: string, slogan: string, r: Rng): THREE.Group {
  const g = new THREE.Group();
  const st = pick(r, BILLBOARD_STYLES);
  const tex = panelTexture(1024, 340, (ctx, w, h) => {
    ctx.fillStyle = st.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = st.accent;
    ctx.fillRect(0, h - 46, w, 46);
    ctx.beginPath();
    ctx.moveTo(w - 260, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h - 46);
    ctx.lineTo(w - 120, h - 46);
    ctx.closePath();
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = st.fg;
    fitText(ctx, brand, w / 2 - 40, h * 0.42, w - 200, 170, '900', 'Impact, Arial Black, sans-serif');
    ctx.fillStyle = st.bg;
    fitText(ctx, slogan.toUpperCase(), w / 2, h - 23, w - 60, 30, '800');
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), new THREE.MeshBasicMaterial({ map: tex }));
  panel.position.y = 4.6;
  g.add(panel);
  g.add(box(12.3, 4.3, 0.25, lambert('#555b66'), 0, 4.6, -0.14));
  for (const x of [-4.5, 4.5]) g.add(box(0.3, 2.6, 0.3, lambert('#5d636e'), x, 1.3, -0.15));
  return g;
}

// ---------- Posizionamento ----------

interface Placement {
  x: number;
  y: number;
  /** Direzione verso cui guarda il fronte dell'oggetto (angolo nel piano di simulazione) */
  facing: number;
}

/**
 * Cerca un punto a distanza `offset` dal bordo, lontano da qualunque altro tratto
 * di pista e fuori dalla zona del traguardo (tribune e box).
 */
function findSpot(track: Track, s: number, side: number, offset: number, faceTraffic: number): Placement | null {
  const L = track.length;
  const ss = ((s % L) + L) % L;
  if (ss < 450 || ss > L - 450) return null;
  const p = track.poseAt(ss);
  const nx = -Math.sin(p.heading);
  const ny = Math.cos(p.heading);
  const off = side * (track.halfWidth + offset);
  const x = p.x + nx * off;
  const y = p.y + ny * off;
  const q: TrackQuery = { index: -1, s: 0, lateral: 0, surface: Surface.Grass, offTrack: true };
  track.query(x, y, -1, q);
  if (Math.abs(q.lateral) < track.halfWidth + offset - 2) return null;
  // Verso la pista, ruotato verso il traffico in arrivo
  const toTrack = Math.atan2(-ny * side, -nx * side);
  let d = p.heading + Math.PI - toTrack;
  d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
  return { x, y, facing: toTrack + d * faceTraffic };
}

function place(obj: THREE.Object3D, p: Placement): void {
  obj.position.set(p.x, 0, -p.y);
  // Fronte (+z locale) orientato verso facing: in Three la direzione sim (dx, dy) è (dx, 0, -dy)
  // Ry(θ) porta (0,0,1) in (sinθ, 0, cosθ): deve valere (cos f, 0, -sin f)
  obj.rotation.y = Math.atan2(Math.cos(p.facing), -Math.sin(p.facing));
}

export function buildScenery(track: Track, seed = 42): THREE.Group {
  const group = new THREE.Group();
  const r = seeded(seed + track.length);
  const L = track.length;
  const sp = sponsors();

  const scatter = (count: number, make: (i: number) => THREE.Object3D, offset: [number, number], faceTraffic: number) => {
    for (let i = 0; i < count; i++) {
      const base = ((i + 0.5) / count) * L;
      for (let attempt = 0; attempt < 12; attempt++) {
        const s = base + (r() - 0.5) * (L / count) * 0.6;
        const side = r() < 0.5 ? -1 : 1;
        const p = findSpot(track, s, side, offset[0] + r() * (offset[1] - offset[0]), faceTraffic);
        if (!p) continue;
        const o = make(i);
        place(o, p);
        group.add(o);
        break;
      }
    }
  };

  const towns = [...LOCALITA].sort(() => r() - 0.5);
  scatter(Math.max(4, Math.round(L / 850)), () => kiosk(r), [16, 30], 0.25);
  scatter(Math.round(L / 450), (i) => billboard(sp.marchi[i % sp.marchi.length], pick(r, sp.slogan), r), [8, 14], 0.55);
  scatter(Math.round(L / 600), (i) => townSign(towns[i % towns.length]), [5, 8], 0.9);
  scatter(Math.round(L / 900), (i) => directionSign(towns[(i + 7) % towns.length], 3 + Math.floor(r() * 40), r() < 0.5), [6, 9], 0.9);
  return group;
}
