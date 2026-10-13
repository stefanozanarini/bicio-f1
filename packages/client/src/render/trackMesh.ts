import { Surface, type Track, type TrackQuery } from '@bicio/sim-core';
import * as THREE from 'three';
import { buildScenery, buildSeaside } from './scenery.ts';
import { asphaltTexture, checkerTexture, grassTexture, kerbTexture, labelTexture, seeded } from './textures.ts';

/**
 * Converte coordinate di simulazione (x, y nel piano, y verso "nord") in Three.js
 * (y verso l'alto): sim (x, y) -> three (x, h, -y).
 */
export function toThree(x: number, y: number, h = 0): THREE.Vector3 {
  return new THREE.Vector3(x, h, -y);
}

/** Nastro lungo la pista tra due scostamenti laterali (positivo = sinistra). */
function ribbon(
  track: Track,
  inner: number,
  outer: number,
  h: number,
  vScale: number,
  include?: (i: number) => boolean,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const n = track.count;
  let open = false;
  for (let k = 0; k <= n; k++) {
    const i = k % n;
    const ok = include ? include(i) : true;
    if (!ok) {
      open = false;
      continue;
    }
    const nx = -track.ty[i];
    const ny = track.tx[i];
    const px = track.px[i];
    const py = track.py[i];
    const base = pos.length / 3;
    pos.push(px + nx * inner, h, -(py + ny * inner));
    pos.push(px + nx * outer, h, -(py + ny * outer));
    const v = (k * track.spacing) / vScale;
    uv.push(0, v, 1, v);
    if (open) {
      const a = base - 2;
      // Ordine dei vertici scelto per avere la normale verso l'alto qualunque sia il lato
      if (outer > inner) idx.push(a, base, a + 1, a + 1, base, base + 1);
      else idx.push(a, a + 1, base, a + 1, base + 1, base);
    }
    open = true;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface TrackSceneOptions {
  trees: number;
  shadows: boolean;
}

export function buildTrackScene(track: Track, opts: TrackSceneOptions): THREE.Group {
  const group = new THREE.Group();
  const hw = track.halfWidth;
  const kw = track.def.kerbWidth;

  // Prato
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < track.count; i++) {
    minX = Math.min(minX, track.px[i]);
    maxX = Math.max(maxX, track.px[i]);
    minY = Math.min(minY, track.py[i]);
    maxY = Math.max(maxY, track.py[i]);
  }
  const margin = 1500;
  const gw = maxX - minX + 2 * margin;
  const gh = maxY - minY + 2 * margin;
  const grassTex = grassTexture();
  grassTex.repeat.set(gw / 40, gh / 40);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(gw, gh),
    new THREE.MeshLambertMaterial({ map: grassTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((minX + maxX) / 2, -0.02, -(minY + maxY) / 2);
  ground.receiveShadow = opts.shadows;
  group.add(ground);

  // Asfalto
  const asphalt = asphaltTexture();
  const road = new THREE.Mesh(
    ribbon(track, -hw - 0.6, hw + 0.6, 0, 12),
    new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, metalness: 0 }),
  );
  asphalt.repeat.set(1, 1);
  road.receiveShadow = opts.shadows;
  group.add(road);

  // Linee bianche (limiti della pista)
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
  group.add(new THREE.Mesh(ribbon(track, hw - 0.25, hw, 0.012, 10), white));
  group.add(new THREE.Mesh(ribbon(track, -hw, -hw + 0.25, 0.012, 10), white));

  // Cordoli
  const kerbMat = new THREE.MeshLambertMaterial({ map: kerbTexture() });
  const isKerb = (i: number) => track.kerb[i] === 1;
  group.add(new THREE.Mesh(ribbon(track, hw, hw + kw, 0.03, 4, isKerb), kerbMat));
  group.add(new THREE.Mesh(ribbon(track, -hw, -hw - kw, 0.03, 4, isKerb), kerbMat));

  // Traguardo a scacchi
  const checker = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, track.def.width),
    new THREE.MeshLambertMaterial({ map: checkerTexture() }),
  );
  const p0 = track.poseAt(0);
  checker.rotation.x = -Math.PI / 2;
  checker.rotation.z = p0.heading;
  checker.position.copy(toThree(p0.x, p0.y, 0.015));
  group.add(checker);

  // Portale del traguardo
  const gantryMat = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });
  const nx = -Math.sin(p0.heading);
  const ny = Math.cos(p0.heading);
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), gantryMat);
    pole.position.copy(toThree(p0.x + nx * side * (hw + 3), p0.y + ny * side * (hw + 3), 3.5));
    group.add(pole);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, track.def.width + 7), gantryMat);
  beam.position.copy(toThree(p0.x, p0.y, 7));
  beam.rotation.y = p0.heading;
  group.add(beam);

  addBrakeBoards(group, track);
  addGrandstand(group, track);
  addTrees(group, track, opts.trees);
  group.add(buildScenery(track));
  if (track.def.theme === 'mare') group.add(buildSeaside(track));
  return group;
}

/** Cartelli 300/200/100 m prima delle frenate principali, sul lato esterno. */
function addBrakeBoards(group: THREE.Group, track: Track): void {
  const n = track.count;
  const win = Math.round(10 / track.spacing);
  const smooth = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -win; k <= win; k++) acc += track.curvature[(i + k + n) % n];
    smooth[i] = acc / (2 * win + 1);
  }
  const mats = new Map<string, THREE.Material>();
  const mat = (t: string) => {
    if (!mats.has(t)) mats.set(t, new THREE.MeshBasicMaterial({ map: labelTexture(t) }));
    return mats.get(t)!;
  };
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x777777 });
  // Inizio curva: curvatura sopra la soglia dopo almeno 250 m quasi dritti
  let straight = 0;
  for (let i = 0; i < n; i++) {
    const k = Math.abs(smooth[i]);
    if (k < 1 / 600) {
      straight += track.spacing;
      continue;
    }
    if (k > 1 / 160 && straight > 250) {
      const outside = smooth[i] > 0 ? -1 : 1;
      for (const d of [300, 200, 100]) {
        const p = track.poseAt(track.s[i] - d);
        const nx = -Math.sin(p.heading);
        const ny = Math.cos(p.heading);
        const off = outside * (track.halfWidth + 6);
        const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat(String(d)));
        board.position.copy(toThree(p.x + nx * off, p.y + ny * off, 1.6));
        // Il cartello guarda verso le auto in arrivo
        board.rotation.y = p.heading - Math.PI / 2;
        group.add(board);
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), poleMat);
        pole.position.copy(toThree(p.x + nx * off, p.y + ny * off, 0.4));
        group.add(pole);
      }
    }
    straight = 0;
  }
}

function addGrandstand(group: THREE.Group, track: Track): void {
  const mat = new THREE.MeshLambertMaterial({ color: 0x8a93a6 });
  const roof = new THREE.MeshLambertMaterial({ color: 0xd8dce4 });
  for (const s of [-300, -150, 0, 150, 300]) {
    const p = track.poseAt(s);
    const nx = -Math.sin(p.heading);
    const ny = Math.cos(p.heading);
    const off = track.halfWidth + 30;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(140, 12, 18), mat);
    stand.position.copy(toThree(p.x + nx * off, p.y + ny * off, 6));
    stand.rotation.y = p.heading;
    group.add(stand);
    const top = new THREE.Mesh(new THREE.BoxGeometry(140, 0.5, 22), roof);
    top.position.copy(toThree(p.x + nx * off, p.y + ny * off, 15));
    top.rotation.y = p.heading;
    group.add(top);
  }
  // Muretto box
  const wall = new THREE.MeshLambertMaterial({ color: 0xc9ccd2 });
  for (let s = -400; s <= 400; s += 40) {
    const p = track.poseAt(s);
    const nx = -Math.sin(p.heading);
    const ny = Math.cos(p.heading);
    const off = -(track.halfWidth + 12);
    const w = new THREE.Mesh(new THREE.BoxGeometry(40.5, 1.1, 0.4), wall);
    w.position.copy(toThree(p.x + nx * off, p.y + ny * off, 0.55));
    w.rotation.y = p.heading;
    group.add(w);
  }
}

/** Alberi sparsi lontano dalla pista: profondità e senso della velocità. */
/** Limite est oltre il quale, sulle piste al mare, iniziano spiaggia e acqua. */
export function seaLimit(track: Track): number {
  let maxX = -Infinity;
  for (let i = 0; i < track.count; i++) maxX = Math.max(maxX, track.px[i]);
  return maxX + track.halfWidth + 35;
}

/**
 * Alberi sparsi lontano dalla pista: profondità e senso della velocità.
 * In campagna conifere, al mare pini marittimi con la chioma a ombrello.
 */
function addTrees(group: THREE.Group, track: Track, count: number): void {
  if (count <= 0) return;
  const r = seeded(99);
  const pines = track.def.theme === 'mare';
  const trunkGeo = pines ? new THREE.CylinderGeometry(0.22, 0.32, 8, 6) : new THREE.CylinderGeometry(0.25, 0.35, 3, 6);
  const crownGeo = pines ? new THREE.SphereGeometry(4, 9, 6) : new THREE.ConeGeometry(2.6, 7, 7);
  if (pines) crownGeo.scale(1.15, 0.38, 1.15);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: pines ? 0x6b4a33 : 0x5b4330 }), count);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: pines ? 0x2e5226 : 0x2f5a2a }), count);
  const m = new THREE.Matrix4();
  const q: TrackQuery = { index: -1, s: 0, lateral: 0, surface: Surface.Grass, offTrack: false };
  const sea = pines ? seaLimit(track) - 15 : Infinity;
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 20) {
    const i = Math.floor(r() * track.count);
    const side = r() < 0.5 ? -1 : 1;
    const off = side * (track.halfWidth + 25 + r() * 220);
    const x = track.px[i] - track.ty[i] * off;
    const y = track.py[i] + track.tx[i] * off;
    if (x > sea) continue;
    // Lontano da qualunque tratto della pista
    track.query(x, y, -1, q);
    if (Math.abs(q.lateral) < track.halfWidth + 22) continue;
    const sc = 0.7 + r() * 0.8;
    const trunkH = pines ? 8 : 3;
    const crownY = pines ? 8.6 : 6;
    m.makeScale(sc, sc, sc).setPosition(x, (trunkH / 2) * sc, -y);
    trunks.setMatrixAt(placed, m);
    m.makeScale(sc, sc, sc).setPosition(x, crownY * sc, -y);
    crowns.setMatrixAt(placed, m);
    placed++;
  }
  trunks.count = placed;
  crowns.count = placed;
  group.add(trunks, crowns);
}
