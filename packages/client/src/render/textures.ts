import * as THREE from 'three';

/** Generatore pseudo-casuale deterministico (stessa scena a ogni avvio). */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, size: number, base: [number, number, number], amp: number, seed: number) {
  const img = ctx.createImageData(size, size);
  const r = seeded(seed);
  for (let i = 0; i < size * size; i++) {
    const n = (r() - 0.5) * amp;
    img.data[i * 4] = base[0] + n;
    img.data[i * 4 + 1] = base[1] + n;
    img.data[i * 4 + 2] = base[2] + n;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export function asphaltTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    noise(ctx, s, [62, 63, 66], 34, 1);
    // Leggere chiazze più scure lungo la traiettoria
    const r = seeded(7);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(20,20,22,${0.04 + r() * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(r() * s, r() * s, 10 + r() * 40, 30 + r() * 80, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function grassTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    noise(ctx, s, [70, 112, 48], 40, 2);
    // Strisce di taglio dell'erba: riferimento visivo per la velocità
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)';
      ctx.fillRect(0, (i * s) / 8, s, s / 8);
    }
  });
}

export function kerbTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#d42020';
    ctx.fillRect(0, 0, s, s / 2);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, s / 2, s, s / 2);
  });
}

export function checkerTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (ctx, s) => {
    const n = 8;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#111' : '#eee';
        ctx.fillRect((i * s) / n, (j * s) / n, s / n, s / n);
      }
  });
}

export function labelTexture(text: string, bg = '#ffffff', fg = '#111111'): THREE.CanvasTexture {
  const tex = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = fg;
    ctx.font = `bold ${s * 0.42}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, s / 2, s / 2);
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Texture rettangolare disegnata su canvas (insegne, cartelli, cartelloni). */
export function panelTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Scrive un testo centrato riducendo il corpo finché non entra nella larghezza. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, weight = 'bold', family = 'sans-serif') {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    s -= 2;
  } while (ctx.measureText(text).width > maxW && s > 8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

export function stripesTexture(a: string, b: string, count = 8): THREE.CanvasTexture {
  const tex = panelTexture(256, 64, (ctx, w, h) => {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = i % 2 ? b : a;
      ctx.fillRect((i * w) / count, 0, w / count + 1, h);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
