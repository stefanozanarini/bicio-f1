import { defaultCar2026 } from '@bicio/sim-core';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildCarModel } from '../render/carModel.ts';

const LIVERIES = [
  { body: 0x1b2a6b, accent: 0xff7a00, helmet: 0xffd400, number: 27 },
  { body: 0xb0121b, accent: 0xf5c400, helmet: 0xffffff, number: 16 },
  { body: 0x0d6e4f, accent: 0xe8e8e8, helmet: 0x0d6e4f, number: 44 },
  { body: 0x14141a, accent: 0xff2d8a, helmet: 0xff2d8a, number: 8 },
  { body: 0xe8e8ea, accent: 0x1f4fff, helmet: 0x1f4fff, number: 63 },
];

/** Garage: l'auto in 3D da ruotare con mouse o dito, con l'aerodinamica attiva. */
export function Garage({ onBack }: { onBack: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [livery, setLivery] = useState(0);
  const [straight, setStraight] = useState(false);
  const aero = useRef(0);
  const straightRef = useRef(false);
  straightRef.current = straight;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1e26);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
    scene.add(new THREE.HemisphereLight(0xdfefff, 0x2a2e36, 0.9));
    const key = new THREE.DirectionalLight(0xfff3e0, 2.4);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
    scene.add(key);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.MeshStandardMaterial({ color: 0x2b303a, roughness: 0.6, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const car = buildCarModel(defaultCar2026(), LIVERIES[livery]);
    car.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    scene.add(car.root);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
    camera.position.set(5.2, 1.9, 4.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.45, 0);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.minDistance = 2.5;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;

    let framed = false;
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!framed && w > 0) {
        // Inquadratura iniziale: l'auto intera anche su schermi stretti (telefono in verticale)
        const k = Math.max(1, 1.5 / camera.aspect);
        camera.position.set(5.2 * k, 1.9 + 0.3 * k, 4.2 * k);
        controls.maxDistance = 12 * k;
        framed = true;
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    let last = performance.now();
    let t = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = (now - last) / 1000;
      last = now;
      t += dt;
      aero.current += ((straightRef.current ? 1 : 0) - aero.current) * Math.min(1, dt * 4);
      car.setActiveAero(aero.current);
      car.setRainLight(Math.floor(t * 3) % 2 === 0);
      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [livery]);

  return (
    <div className="garage">
      <div ref={host} className="garage-view" />
      <div className="garage-ui">
        <button onClick={onBack}>← Menu</button>
        <div className="garage-title">
          Garage <span>· trascina per ruotare, rotella o pizzico per lo zoom</span>
        </div>
        <div className="garage-actions">
          <button onClick={() => setLivery((l) => (l + 1) % LIVERIES.length)}>Cambia livrea</button>
          <button className={straight ? 'primary' : ''} onClick={() => setStraight((s) => !s)}>
            Aero: {straight ? 'rettilineo' : 'curva'}
          </button>
        </div>
      </div>
    </div>
  );
}
