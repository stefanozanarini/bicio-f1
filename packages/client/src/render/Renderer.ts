import type { CarParams, Track } from '@bicio/sim-core';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Snapshot } from '../protocol.ts';
import { buildCarModel, type CarModel } from './carModel.ts';
import { buildTrackScene } from './trackMesh.ts';

export type CameraMode = 'chase' | 'tcam' | 'cockpit';
export const CAMERA_MODES: CameraMode[] = ['chase', 'tcam', 'cockpit'];
export const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Inseguimento',
  tcam: 'T-cam',
  cockpit: 'Abitacolo',
};

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';
export const QUALITY_LABELS: Record<QualityPreset, string> = {
  low: 'Basso',
  medium: 'Medio',
  high: 'Alto',
  ultra: 'Ultra',
};

interface QualitySpec {
  pixelRatio: number;
  antialias: boolean;
  shadowMap: number;
  trees: number;
  far: number;
}

function spec(q: QualityPreset): QualitySpec {
  const dpr = window.devicePixelRatio || 1;
  switch (q) {
    case 'low':
      return { pixelRatio: Math.min(dpr, 1) * 0.75, antialias: false, shadowMap: 0, trees: 120, far: 1800 };
    case 'medium':
      return { pixelRatio: Math.min(dpr, 1.25), antialias: true, shadowMap: 1024, trees: 450, far: 2600 };
    case 'high':
      return { pixelRatio: Math.min(dpr, 2), antialias: true, shadowMap: 2048, trees: 1000, far: 3500 };
    case 'ultra':
      return { pixelRatio: Math.min(dpr, 2.5), antialias: true, shadowMap: 4096, trees: 2000, far: 4500 };
  }
}

/** Scelta del preset al primo avvio, in base alla GPU dichiarata dal browser. */
export function detectQuality(): QualityPreset {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/intel|uhd|iris|mali|adreno|powervr|llvmpipe|swiftshader|apple gpu/i.test(name)) return 'low';
    if (/rtx|radeon rx [67]|rx 7|rx 6/i.test(name)) return 'high';
    return 'medium';
  } catch {
    return 'low';
  }
}

const SKY = 0xa9cdee;

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly quality: QualityPreset;
  cameraMode: CameraMode = 'chase';

  private readonly car: CarModel;
  private readonly sun: THREE.DirectionalLight;
  private readonly container: HTMLElement;
  private readonly chasePos = new THREE.Vector3();
  private chaseHeading = 0;
  private chaseInit = false;
  private time = 0;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly lookOffset = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  private readonly resizeObs: ResizeObserver;

  constructor(container: HTMLElement, track: Track, params: CarParams, quality: QualityPreset) {
    this.container = container;
    this.quality = quality;
    const q = spec(quality);
    this.renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = q.shadowMap > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, q.far * 0.25, q.far);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, q.far);

    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 1.1));
    this.sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
    this.sun.position.set(200, 400, 150);
    if (q.shadowMap > 0) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      const sc = this.sun.shadow.camera;
      sc.left = -15;
      sc.right = 15;
      sc.top = 15;
      sc.bottom = -15;
      sc.near = 1;
      sc.far = 600;
      this.sun.shadow.bias = -0.0005;
    }
    this.scene.add(this.sun, this.sun.target);
    // Riflessi sulla vernice (non sul preset più leggero)
    if (quality !== 'low') {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.35;
      pmrem.dispose();
    }

    this.scene.add(buildTrackScene(track, { trees: q.trees, shadows: q.shadowMap > 0 }));
    this.car = buildCarModel(params);
    // Prima l'imbardata, poi beccheggio e rollio nel riferimento vettura
    this.car.root.rotation.order = 'YXZ';
    this.scene.add(this.car.root);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  cycleCamera(): CameraMode {
    const i = CAMERA_MODES.indexOf(this.cameraMode);
    this.cameraMode = CAMERA_MODES[(i + 1) % CAMERA_MODES.length];
    this.chaseInit = false;
    return this.cameraMode;
  }

  render(prev: Snapshot | null, curr: Snapshot, alpha: number, dt: number): void {
    this.time += dt;
    const p = prev ?? curr;
    const x = p.x + (curr.x - p.x) * alpha;
    const y = p.y + (curr.y - p.y) * alpha;
    let dh = curr.heading - p.heading;
    dh -= Math.PI * 2 * Math.round(dh / (Math.PI * 2));
    const heading = p.heading + dh * alpha;

    // Vettura
    const car = this.car;
    car.root.position.set(x, 0, -y);
    car.root.rotation.y = heading;
    // Beccheggio e rollio visivi dalle accelerazioni (in fase 2 dalle sospensioni simulate)
    car.root.rotation.z = THREE.MathUtils.clamp(curr.longG * 0.006, -0.03, 0.03);
    car.root.rotation.x = THREE.MathUtils.clamp(curr.latG * 0.004, -0.025, 0.025);
    for (let i = 0; i < 4; i++) {
      car.pivots[i].rotation.y = curr.wheels[i].steer;
      car.spins[i].rotation.z = -curr.wheels[i].spin;
    }
    car.steeringWheel.rotation.x = -curr.steer * 1.9;
    car.setActiveAero(p.aeroBlend + (curr.aeroBlend - p.aeroBlend) * alpha);
    // Luce posteriore lampeggiante quando l'ERS recupera, come sulle F1 vere
    car.setRainLight(curr.ersHarvest > 0 && Math.floor(this.time * 6) % 2 === 0);

    // Sole e ombre seguono l'auto
    this.sun.position.set(x + 60, 120, -y + 40);
    this.sun.target.position.set(x, 0, -y);

    this.updateCamera(x, y, heading, curr, dt);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(x: number, y: number, heading: number, s: Snapshot, dt: number): void {
    const cam = this.camera;
    const kmh = s.speed * 3.6;
    const onKerb = s.wheels.some((w) => w.surface === 1);
    const offRoad = s.wheels.some((w) => w.surface === 2);
    const shakeAmp = (onKerb ? 0.012 : 0) + (offRoad ? 0.02 : 0) + Math.min(kmh, 340) * 0.000012;
    const t = this.time;
    const shakeY = shakeAmp * (Math.sin(t * 71) + 0.6 * Math.sin(t * 113 + 1.3));
    const shakeZ = shakeAmp * 0.6 * Math.sin(t * 89 + 0.7);

    if (this.cameraMode === 'chase') {
      // Segue la direzione della velocità quando l'auto scivola, con un leggero ritardo
      const velHeading = s.speed > 3 ? heading + Math.atan2(s.v, Math.max(s.u, 0.1)) : heading;
      let target = heading + 0.5 * (velHeading - heading);
      let d = target - this.chaseHeading;
      d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
      if (!this.chaseInit) {
        this.chaseHeading = target;
        d = 0;
      }
      this.chaseHeading += d * (1 - Math.exp(-dt * 7));
      target = this.chaseHeading;
      const dist = 6.8 + Math.min(kmh, 330) * 0.004;
      const desired = this.tmpV.set(x - Math.cos(target) * dist, 2.15, -(y - Math.sin(target) * dist));
      if (!this.chaseInit) {
        this.chasePos.copy(desired);
        this.chaseInit = true;
      }
      this.chasePos.lerp(desired, 1 - Math.exp(-dt * 14));
      cam.position.copy(this.chasePos);
      cam.position.y += shakeY;
      cam.lookAt(x + Math.cos(heading) * 4, 0.9, -(y + Math.sin(heading) * 4));
      cam.fov = 60 + Math.min(kmh, 330) * 0.012;
    } else {
      const eye = this.cameraMode === 'cockpit' ? this.car.cockpitEye : this.car.tcamEye;
      this.car.root.updateMatrixWorld(true);
      eye.getWorldPosition(cam.position);
      cam.position.y += shakeY;
      this.car.root.getWorldQuaternion(this.tmpQ);
      cam.quaternion.copy(this.tmpQ).multiply(this.lookOffset);
      cam.rotateZ(shakeZ);
      cam.fov = this.cameraMode === 'cockpit' ? 74 : 68;
    }
    cam.updateProjectionMatrix();
  }

  dispose(): void {
    this.resizeObs.disconnect();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
    this.renderer.domElement.remove();
  }
}
