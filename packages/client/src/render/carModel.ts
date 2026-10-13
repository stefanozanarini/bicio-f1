import type { CarParams } from '@bicio/sim-core';
import * as THREE from 'three';

/**
 * Modello 3D procedurale di una F1 2026.
 * Riferimento locale: +x avanti, +y in alto, -z a sinistra. Origine nel baricentro, a terra.
 *
 * Le forme principali (scocca, pance, cofano) sono "lofting" di sezioni arrotondate,
 * le ali hanno un profilo alare vero, le gomme una spalla arrotondata.
 * Le alette mobili seguono l'aerodinamica attiva e la luce posteriore lampeggia
 * quando l'ERS recupera energia, come sulle vetture reali.
 */
export interface CarModel {
  root: THREE.Group;
  /** Gruppi per lo sterzo (anteriori) e per la rotazione delle ruote, ordine FL, FR, RL, RR */
  pivots: THREE.Group[];
  spins: THREE.Group[];
  steeringWheel: THREE.Group;
  /** Punti di vista per le telecamere di bordo */
  cockpitEye: THREE.Object3D;
  tcamEye: THREE.Object3D;
  /** 0 = configurazione curva, 1 = rettilineo */
  setActiveAero(blend: number): void;
  setRainLight(on: boolean): void;
}

export interface Livery {
  body: number;
  accent: number;
  helmet?: number;
  number?: number;
}

interface Station {
  x: number;
  /** Larghezza, altezza e quota del centro della sezione */
  w: number;
  h: number;
  y: number;
}

/** Superficie che passa per sezioni "superellittiche" (rettangoli arrotondati) lungo x. */
function loft(stations: Station[], radial = 28, exponent = 2.8, sub = 4): THREE.BufferGeometry {
  // Interpolazione morbida delle sezioni lungo x
  const curve = new THREE.CatmullRomCurve3(stations.map((s) => new THREE.Vector3(s.x, s.w, s.h)), false, 'centripetal');
  const curveY = new THREE.CatmullRomCurve3(stations.map((s) => new THREE.Vector3(s.x, s.y, 0)), false, 'centripetal');
  const rings = (stations.length - 1) * sub + 1;
  const pos: number[] = [];
  const idx: number[] = [];
  const e = 2 / exponent;
  const sgnPow = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const a = curve.getPoint(t);
    const yc = curveY.getPoint(t).y;
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      pos.push(a.x, yc + (a.z / 2) * sgnPow(Math.sin(th)), (a.y / 2) * sgnPow(Math.cos(th)));
    }
  }
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < radial; j++) {
      const p = i * (radial + 1) + j;
      const q = p + radial + 1;
      idx.push(p, p + 1, q, p + 1, q + 1, q);
    }
  // Tappi alle estremità
  for (const [ring, flip] of [
    [0, true],
    [rings - 1, false],
  ] as const) {
    const t = ring / (rings - 1);
    const a = curve.getPoint(t);
    const center = pos.length / 3;
    pos.push(a.x, curveY.getPoint(t).y, 0);
    for (let j = 0; j < radial; j++) {
      const p = ring * (radial + 1) + j;
      if (flip) idx.push(center, p + 1, p);
      else idx.push(center, p, p + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Profilo alare NACA a 4 cifre semplificato, bordo d'attacco verso +x, estruso lungo z. */
function airfoil(chord: number, thickness: number, camber: number, span: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const n = 16;
  const upper: [number, number][] = [];
  const lower: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const xc = (1 - Math.cos((i / n) * Math.PI)) / 2;
    const yt = 5 * thickness * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1015 * xc ** 4);
    const yc = camber * 4 * xc * (1 - xc);
    upper.push([-xc * chord, (yc + yt) * chord]);
    lower.push([-xc * chord, (yc - yt) * chord]);
  }
  shape.moveTo(upper[0][0], upper[0][1]);
  for (const p of upper.slice(1)) shape.lineTo(p[0], p[1]);
  for (const p of lower.reverse()) shape.lineTo(p[0], p[1]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: span, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -span / 2);
  return g;
}

/** Cilindro sottile tra due punti (bracci delle sospensioni, supporti). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 8), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** Gomma con la spalla arrotondata (tornio attorno all'asse della ruota). */
function tyreGeometry(radius: number, width: number, rim: number): THREE.BufferGeometry {
  const r = 0.035;
  const pts: THREE.Vector2[] = [];
  const hw = width / 2;
  pts.push(new THREE.Vector2(rim, -hw + 0.01));
  pts.push(new THREE.Vector2(radius - r - 0.02, -hw));
  for (let k = 0; k <= 6; k++) {
    const a = -Math.PI / 2 + (k / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - r + Math.cos(a) * r, -hw + r + Math.sin(a) * r));
  }
  for (let k = 0; k <= 6; k++) {
    const a = (k / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - r + Math.cos(a) * r, hw - r + Math.sin(a) * r));
  }
  pts.push(new THREE.Vector2(radius - r - 0.02, hw));
  pts.push(new THREE.Vector2(rim, hw - 0.01));
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateX(Math.PI / 2);
  return g;
}

function wheelCoverTexture(stripe: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, '#4a4d55');
  g.addColorStop(1, '#22242a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // Razze stilizzate: rendono visibile la rotazione
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 9;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30);
    ctx.lineTo(128 + Math.cos(a + 0.35) * 118, 128 + Math.sin(a + 0.35) * 118);
    ctx.stroke();
  }
  ctx.fillStyle = stripe;
  ctx.beginPath();
  ctx.arc(128, 128, 18, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function numberTexture(n: number, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = fg;
  ctx.font = 'italic 900 92px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export function buildCarModel(params: CarParams, livery: Livery = { body: 0x1b2a6b, accent: 0xff7a00 }): CarModel {
  const root = new THREE.Group();
  const ch = params.chassis;
  const a = ch.wheelbase * (1 - ch.weightFront);
  const b = ch.wheelbase * ch.weightFront;

  // Vernice lucida con trasparente, carbonio satinato
  const paint = new THREE.MeshPhysicalMaterial({ color: livery.body, metalness: 0.25, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  const accent = new THREE.MeshPhysicalMaterial({ color: livery.accent, metalness: 0.2, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x141518, metalness: 0.35, roughness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x07080a, metalness: 0.1, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8f99, metalness: 0.9, roughness: 0.3 });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    root.add(m);
    return m;
  };

  // ---- Fondo: sagoma vista dall'alto, più larga al centro, con il "plank"
  const floorShape = new THREE.Shape();
  const fl: [number, number][] = [
    [1.55, 0.18], [1.1, 0.55], [0.6, 0.78], [-0.9, 0.8], [-1.35, 0.62], [-1.95, 0.5],
    [-1.95, -0.5], [-1.35, -0.62], [-0.9, -0.8], [0.6, -0.78], [1.1, -0.55], [1.55, -0.18],
  ];
  floorShape.moveTo(fl[0][0], fl[0][1]);
  for (const p of fl.slice(1)) floorShape.lineTo(p[0], p[1]);
  const floorGeo = new THREE.ExtrudeGeometry(floorShape, { depth: 0.035, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.01, bevelSegments: 2 });
  floorGeo.rotateX(-Math.PI / 2);
  add(floorGeo, carbon, 0, 0.05, 0);
  // Bordi del fondo rialzati e diffusore
  for (const side of [-1, 1]) {
    const edge = add(new THREE.BoxGeometry(1.9, 0.08, 0.03), carbon, -0.2, 0.1, side * 0.79);
    edge.rotation.y = side * 0.02;
  }
  const diff = add(new THREE.BoxGeometry(0.55, 0.03, 1.0), carbon, -b - 0.42, 0.17, 0);
  diff.rotation.z = 0.32;
  for (const z of [-0.5, -0.17, 0.17, 0.5]) {
    const fence = add(new THREE.BoxGeometry(0.55, 0.16, 0.015), carbon, -b - 0.42, 0.13, z);
    fence.rotation.z = 0.32;
  }

  // ---- Scocca: muso basso, abitacolo, cofano motore che si stringe verso il retro
  const tub = loft([
    { x: a + 0.95, w: 0.16, h: 0.1, y: 0.27 },
    { x: a + 0.55, w: 0.28, h: 0.2, y: 0.31 },
    { x: a, w: 0.44, h: 0.32, y: 0.39 },
    { x: 1.2, w: 0.62, h: 0.44, y: 0.45 },
    { x: 0.7, w: 0.78, h: 0.5, y: 0.48 },
    { x: 0.1, w: 0.86, h: 0.55, y: 0.5 },
    { x: -0.5, w: 0.74, h: 0.66, y: 0.56 },
    { x: -1.1, w: 0.5, h: 0.5, y: 0.5 },
    { x: -1.7, w: 0.28, h: 0.3, y: 0.42 },
    { x: -b - 0.5, w: 0.12, h: 0.14, y: 0.37 },
  ]);
  add(tub, paint);

  // Pance laterali con le prese d'aria
  for (const side of [-1, 1]) {
    const pod = loft(
      [
        { x: 0.95, w: 0.36, h: 0.36, y: 0.36 },
        { x: 0.75, w: 0.42, h: 0.42, y: 0.37 },
        { x: 0.1, w: 0.44, h: 0.42, y: 0.37 },
        { x: -0.6, w: 0.34, h: 0.32, y: 0.33 },
        { x: -1.25, w: 0.14, h: 0.16, y: 0.26 },
      ],
      20,
      3.2,
    );
    add(pod, paint, 0, 0, side * 0.55);
    const inlet = add(new THREE.BoxGeometry(0.03, 0.26, 0.3), dark, 0.955, 0.38, side * 0.55);
    inlet.rotation.y = side * 0.05;
    // Fascia colorata lungo la pancia
    const stripe = add(new THREE.BoxGeometry(1.2, 0.05, 0.01), accent, 0.2, 0.47, side * 0.765);
    stripe.rotation.z = -0.04;
  }

  // Apertura dell'abitacolo, casco con visiera
  const cockpit = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), dark);
  cockpit.scale.set(1, 0.42, 1);
  cockpit.rotation.x = -Math.PI / 2;
  cockpit.position.set(0.35, 0.775, 0);
  root.add(cockpit);
  const helmetMat = new THREE.MeshPhysicalMaterial({ color: livery.helmet ?? 0xffd400, roughness: 0.25, clearcoat: 1 });
  const helmet = add(new THREE.SphereGeometry(0.14, 24, 16), helmetMat, 0.18, 0.84, 0);
  helmet.scale.set(1.08, 1, 0.95);
  const visor = add(new THREE.SphereGeometry(0.142, 24, 8, -0.9, 1.8, 1.25, 0.45), new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.8, roughness: 0.15 }), 0.18, 0.84, 0);
  visor.rotation.y = 0;

  // Presa d'aria sopra la testa e pinna dorsale
  const airbox = loft(
    [
      { x: 0.05, w: 0.24, h: 0.26, y: 0.93 },
      { x: -0.2, w: 0.3, h: 0.34, y: 0.9 },
      { x: -0.6, w: 0.22, h: 0.22, y: 0.82 },
    ],
    20,
    2.6,
    3,
  );
  add(airbox, accent);
  add(new THREE.CircleGeometry(0.1, 16), dark, 0.051, 0.93, 0).rotation.y = Math.PI / 2;
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.45, 0.86);
  finShape.quadraticCurveTo(-1.1, 1.02, -1.75, 0.86);
  finShape.lineTo(-1.8, 0.5);
  finShape.lineTo(-0.6, 0.8);
  const fin = add(new THREE.ExtrudeGeometry(finShape, { depth: 0.012, bevelEnabled: false }), paint, 0, 0, -0.006);
  fin.castShadow = false;

  // Numero di gara sul muso e sulla pinna
  const num = livery.number ?? 7;
  const numMat = new THREE.MeshBasicMaterial({ map: numberTexture(num, '#ffffff'), transparent: true });
  const noseNum = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), numMat);
  noseNum.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
  noseNum.position.set(a + 0.15, 0.555, 0);
  root.add(noseNum);
  for (const side of [-1, 1]) {
    const finNum = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), numMat);
    finNum.position.set(-1.15, 0.84, side * 0.008);
    if (side < 0) finNum.rotation.y = Math.PI;
    root.add(finNum);
  }

  // ---- Halo tubolare con il pilone centrale
  const haloPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 0.76, -0.3),
    new THREE.Vector3(0.18, 0.93, -0.3),
    new THREE.Vector3(0.48, 0.97, -0.18),
    new THREE.Vector3(0.6, 0.97, 0),
    new THREE.Vector3(0.48, 0.97, 0.18),
    new THREE.Vector3(0.18, 0.93, 0.3),
    new THREE.Vector3(0.0, 0.76, 0.3),
  ]);
  add(new THREE.TubeGeometry(haloPath, 40, 0.024, 8, false), carbon);
  root.add(rod(new THREE.Vector3(0.6, 0.97, 0), new THREE.Vector3(0.78, 0.7, 0), 0.022, carbon));

  // Specchietti
  for (const side of [-1, 1]) {
    root.add(rod(new THREE.Vector3(0.75, 0.62, side * 0.3), new THREE.Vector3(0.72, 0.72, side * 0.48), 0.012, carbon));
    const mirror = add(new THREE.BoxGeometry(0.06, 0.06, 0.14), paint, 0.72, 0.74, side * 0.5);
    mirror.rotation.y = side * -0.1;
  }

  // ---- Ala anteriore: tre elementi a profilo alare, paratie laterali
  const frontFlaps = new THREE.Group();
  const fwX = a + 0.95;
  const fw1 = add(airfoil(0.32, 0.1, 0.06, 1.7), carbon, fwX, 0.1, 0);
  fw1.rotation.z = -0.05;
  const flapA = new THREE.Mesh(airfoil(0.2, 0.1, 0.08, 1.62), accent);
  flapA.position.set(fwX - 0.27, 0.15, 0);
  const flapB = new THREE.Mesh(airfoil(0.16, 0.1, 0.08, 1.55), paint);
  flapB.position.set(fwX - 0.41, 0.21, 0);
  frontFlaps.add(flapA, flapB);
  root.add(frontFlaps);
  for (const side of [-1, 1]) {
    const ep = new THREE.Shape();
    ep.moveTo(fwX + 0.05, 0.05);
    ep.lineTo(fwX - 0.55, 0.05);
    ep.quadraticCurveTo(fwX - 0.62, 0.26, fwX - 0.45, 0.32);
    ep.lineTo(fwX - 0.1, 0.2);
    ep.closePath();
    add(new THREE.ExtrudeGeometry(ep, { depth: 0.015, bevelEnabled: false }), carbon, 0, 0, side * 0.86 - 0.0075);
  }
  // Supporti dell'ala sotto il muso
  for (const side of [-1, 1]) root.add(rod(new THREE.Vector3(fwX - 0.15, 0.13, side * 0.12), new THREE.Vector3(fwX - 0.3, 0.27, side * 0.06), 0.012, carbon));

  // ---- Ala posteriore: piano principale, flap mobile, beam wing, paratie
  const rwX = -b - 0.42;
  add(airfoil(0.32, 0.12, 0.08, 0.98), carbon, rwX, 0.8, 0).rotation.z = -0.12;
  const rearFlap = new THREE.Group();
  rearFlap.position.set(rwX - 0.3, 0.93, 0);
  const rf = new THREE.Mesh(airfoil(0.22, 0.12, 0.08, 0.98), accent);
  rearFlap.add(rf);
  root.add(rearFlap);
  add(airfoil(0.2, 0.12, 0.05, 0.9), carbon, rwX + 0.05, 0.36, 0);
  for (const side of [-1, 1]) {
    const ep = new THREE.Shape();
    ep.moveTo(rwX + 0.12, 0.3);
    ep.lineTo(rwX + 0.12, 0.98);
    ep.quadraticCurveTo(rwX + 0.05, 1.08, rwX - 0.6, 1.06);
    ep.lineTo(rwX - 0.62, 0.62);
    ep.quadraticCurveTo(rwX - 0.4, 0.34, rwX - 0.2, 0.3);
    ep.closePath();
    add(new THREE.ExtrudeGeometry(ep, { depth: 0.018, bevelEnabled: false }), paint, 0, 0, side * 0.5 - 0.009);
  }
  root.add(rod(new THREE.Vector3(rwX - 0.05, 0.38, 0), new THREE.Vector3(rwX - 0.1, 0.8, 0), 0.02, carbon));

  // Luce posteriore (pioggia / recupero ERS)
  const rainMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0x000000, emissiveIntensity: 3 });
  add(new THREE.BoxGeometry(0.02, 0.06, 0.14), rainMat, -b - 0.66, 0.34, 0);

  // ---- Ruote: gomma con spalla arrotondata, copricerchio, banda della mescola
  const pivots: THREE.Group[] = [];
  const spins: THREE.Group[] = [];
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.92, metalness: 0 });
  const coverMat = new THREE.MeshStandardMaterial({ map: wheelCoverTexture('#d21f1f'), roughness: 0.5, metalness: 0.4 });
  const bandMat = new THREE.MeshBasicMaterial({ color: 0xd21f1f, side: THREE.DoubleSide });
  const corners: [number, number, number, number][] = [
    [a, -ch.trackFront / 2, params.tireFront.radius, 0.28],
    [a, ch.trackFront / 2, params.tireFront.radius, 0.28],
    [-b, -ch.trackRear / 2, params.tireRear.radius, 0.375],
    [-b, ch.trackRear / 2, params.tireRear.radius, 0.375],
  ];
  for (const [x, z, r, w] of corners) {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeometry(r, w, r * 0.66), tyreMat);
    tyre.castShadow = true;
    spin.add(tyre);
    for (const s of [-1, 1]) {
      const cover = new THREE.Mesh(new THREE.CircleGeometry(r * 0.67, 32), coverMat);
      cover.position.z = (s * (w / 2 - 0.005));
      if (s < 0) cover.rotation.y = Math.PI;
      spin.add(cover);
      const band = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r * 0.85, 40), bandMat);
      band.position.z = s * (w / 2 + 0.002);
      spin.add(band);
    }
    pivot.add(spin);
    // Presa di raffreddamento dei freni (non ruota)
    const duct = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.08), carbon);
    duct.position.set(0, 0, -Math.sign(z) * (w / 2 + 0.05));
    pivot.add(duct);
    root.add(pivot);
    pivots.push(pivot);
    spins.push(spin);

    // Bracci delle sospensioni verso la scocca
    const hub = new THREE.Vector3(x, r, z - Math.sign(z) * (w / 2 + 0.05));
    const inner = Math.sign(z) * 0.3;
    root.add(rod(new THREE.Vector3(x + 0.25, r + 0.12, inner), hub.clone().setY(r + 0.1), 0.016, carbon));
    root.add(rod(new THREE.Vector3(x - 0.25, r + 0.12, inner), hub.clone().setY(r + 0.1), 0.016, carbon));
    root.add(rod(new THREE.Vector3(x + 0.25, 0.18, inner), hub.clone().setY(r - 0.12), 0.016, carbon));
    root.add(rod(new THREE.Vector3(x - 0.25, 0.18, inner), hub.clone().setY(r - 0.12), 0.016, carbon));
    root.add(rod(new THREE.Vector3(x, r + 0.05, inner), hub.clone().setY(r), 0.012, steel));
  }

  // ---- Volante (visibile dalla camera di bordo)
  const steeringWheel = new THREE.Group();
  steeringWheel.position.set(0.55, 0.68, 0);
  steeringWheel.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.28), carbon));
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshBasicMaterial({ color: hex(livery.accent) }));
  display.position.x = -0.017;
  display.rotation.y = -Math.PI / 2;
  steeringWheel.add(display);
  for (const s of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), dark);
    grip.position.set(0, 0, s * 0.13);
    steeringWheel.add(grip);
  }
  root.add(steeringWheel);

  const cockpitEye = new THREE.Object3D();
  cockpitEye.position.set(0.18, 0.88, 0);
  root.add(cockpitEye);
  const tcamEye = new THREE.Object3D();
  tcamEye.position.set(-0.15, 1.12, 0);
  root.add(tcamEye);

  return {
    root,
    pivots,
    spins,
    steeringWheel,
    cockpitEye,
    tcamEye,
    setActiveAero(blend: number) {
      // In rettilineo i flap si aprono riducendo l'incidenza (meno resistenza)
      flapA.rotation.z = 0.3 - blend * 0.25;
      flapB.rotation.z = 0.45 - blend * 0.35;
      rf.rotation.z = 0.55 - blend * 0.65;
    },
    setRainLight(on: boolean) {
      rainMat.emissive.setHex(on ? 0xff1a1a : 0x000000);
    },
  };
}
