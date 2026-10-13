import type { CarParams } from '@bicio/sim-core';
import * as THREE from 'three';

/**
 * Modello 3D procedurale di una F1 2026 (provvisorio, fase 1).
 * Riferimento locale: +x avanti, +y in alto, -z a sinistra. Origine nel baricentro, a terra.
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
}

export function buildCarModel(params: CarParams, livery = { body: 0x1b2a6b, accent: 0xff7a00 }): CarModel {
  const root = new THREE.Group();
  const ch = params.chassis;
  const a = ch.wheelbase * (1 - ch.weightFront);
  const b = ch.wheelbase * ch.weightFront;

  const body = new THREE.MeshStandardMaterial({ color: livery.body, metalness: 0.35, roughness: 0.38 });
  const accent = new THREE.MeshStandardMaterial({ color: livery.accent, metalness: 0.3, roughness: 0.4 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x17181b, metalness: 0.2, roughness: 0.55 });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };

  // Fondo e diffusore
  box(3.7, 0.04, 1.45, carbon, 0.1, 0.07);
  const diffuser = box(0.5, 0.18, 1.0, carbon, -b - 0.45, 0.16);
  diffuser.rotation.z = 0.25;

  // Scocca, cockpit e muso affusolato
  box(2.0, 0.55, 0.72, body, 0.55, 0.42);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.27, 1.25, 8), body);
  nose.rotation.z = -Math.PI / 2;
  nose.scale.set(1, 1, 0.75);
  nose.position.set(2.15, 0.36, 0);
  nose.castShadow = true;
  root.add(nose);
  box(0.75, 0.06, 0.48, carbon, 0.35, 0.71); // apertura abitacolo
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd400, metalness: 0.2, roughness: 0.3 }),
  );
  helmet.position.set(0.2, 0.83, 0);
  root.add(helmet);

  // Halo
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.028, 8, 24, Math.PI), carbon);
  halo.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
  halo.position.set(0.28, 0.95, 0);
  root.add(halo);
  const pillar = box(0.05, 0.3, 0.05, carbon, 0.7, 0.83);
  pillar.rotation.z = 0.45;

  // Pance laterali, cofano motore, presa d'aria e pinna
  for (const side of [-1, 1]) {
    const pod = box(1.5, 0.42, 0.36, body, 0.0, 0.33, side * 0.55);
    pod.rotation.y = side * 0.04;
    box(0.06, 0.3, 0.3, accent, 0.76, 0.35, side * 0.55);
  }
  box(1.2, 0.42, 0.5, body, -0.85, 0.55);
  box(0.4, 0.32, 0.26, accent, -0.1, 0.98);
  box(1.1, 0.24, 0.02, accent, -0.95, 0.87);

  // Ala anteriore
  const fw = a + 0.85;
  box(0.48, 0.035, 1.75, carbon, fw, 0.11);
  const flap = box(0.26, 0.03, 1.65, accent, fw - 0.16, 0.19);
  flap.rotation.z = 0.3;
  for (const side of [-1, 1]) box(0.55, 0.24, 0.02, carbon, fw - 0.05, 0.2, side * 0.875);

  // Ala posteriore
  const rw = -b - 0.62;
  box(0.36, 0.04, 0.98, carbon, rw, 0.86);
  const rflap = box(0.24, 0.03, 0.98, accent, rw - 0.05, 0.99);
  rflap.rotation.z = 0.35;
  for (const side of [-1, 1]) box(0.62, 0.55, 0.02, body, rw, 0.78, side * 0.5);
  box(0.06, 0.45, 0.06, carbon, rw + 0.1, 0.62);

  // Sospensioni (bracci semplificati)
  const arm = (x: number, z: number, y: number) => {
    const m = box(0.05, 0.03, Math.abs(z) - 0.3, carbon, x, y, z / 2 + Math.sign(z) * 0.15);
    return m;
  };
  for (const side of [-1, 1]) {
    arm(a, side * ch.trackFront * 0.5, 0.42);
    arm(a + 0.12, side * ch.trackFront * 0.5, 0.25);
    arm(-b, side * ch.trackRear * 0.5, 0.42);
    arm(-b - 0.1, side * ch.trackRear * 0.5, 0.25);
  }

  // Ruote
  const pivots: THREE.Group[] = [];
  const spins: THREE.Group[] = [];
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.9, metalness: 0 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.35, metalness: 0.8 });
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe02020, side: THREE.DoubleSide });
  const positions: [number, number, number, number][] = [
    [a, -ch.trackFront / 2, params.tireFront.radius, 0.28],
    [a, ch.trackFront / 2, params.tireFront.radius, 0.28],
    [-b, -ch.trackRear / 2, params.tireRear.radius, 0.375],
    [-b, ch.trackRear / 2, params.tireRear.radius, 0.375],
  ];
  for (const [x, z, r, w] of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 32), tyreMat);
    tyre.rotation.x = Math.PI / 2;
    tyre.castShadow = true;
    spin.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.64, r * 0.64, w + 0.01, 20), rimMat);
    rim.rotation.x = Math.PI / 2;
    spin.add(rim);
    for (const s of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r * 0.84, 32), stripeMat);
      stripe.position.z = (s * (w + 0.012)) / 2;
      spin.add(stripe);
      for (let k = 0; k < 5; k++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.035, r * 1.2, 0.01), tyreMat);
        spoke.rotation.z = (k * Math.PI * 2) / 5;
        spoke.position.z = (s * (w + 0.02)) / 2;
        spin.add(spoke);
      }
    }
    pivot.add(spin);
    root.add(pivot);
    pivots.push(pivot);
    spins.push(spin);
  }

  // Volante (visibile dalla camera di bordo)
  const steeringWheel = new THREE.Group();
  steeringWheel.position.set(0.55, 0.68, 0);
  const sw = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.27), carbon);
  steeringWheel.add(sw);
  const swDisplay = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.07, 0.11), accent);
  steeringWheel.add(swDisplay);
  root.add(steeringWheel);

  const cockpitEye = new THREE.Object3D();
  cockpitEye.position.set(0.18, 0.86, 0);
  root.add(cockpitEye);
  const tcamEye = new THREE.Object3D();
  tcamEye.position.set(-0.12, 1.2, 0);
  root.add(tcamEye);

  return { root, pivots, spins, steeringWheel, cockpitEye, tcamEye };
}
