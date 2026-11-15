import * as THREE from 'three';
import { buildVoxelGeometry, spriteFromRows } from '../render/voxel';

/**
 * Piezas comunes de las escenas 2.5D de los minijuegos: muelles, cifras de
 * vóxeles, partículas de cubos, encuadre de la cámara y liberación de la GPU.
 */

/** Muelle amortiguado alrededor de 0 (para golpes que rebotan y se asientan). */
export class Spring {
  value = 0;
  velocity = 0;
  constructor(
    private k: number,
    private c: number,
  ) {}
  update(dt: number): void {
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.velocity += (-this.k * this.value - this.c * this.velocity) * h;
      this.value += this.velocity * h;
    }
  }
}

/** Caracteres de 3×5 píxeles (fila 0 arriba), como los marcadores de las recreativas. */
const GLYPHS: Record<string, string> = {
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '111001111100111',
  '3': '111001111001111',
  '4': '101101111001001',
  '5': '111100111001111',
  '6': '111100111101111',
  '7': '111001001001001',
  '8': '111101111101111',
  '9': '111101111001111',
  '/': '001001010100100',
};

/**
 * Geometrías de vóxeles de los caracteres de marcador, en el plano XY (Y hacia
 * arriba) con una capa de grosor en Z, centradas. Color blanco por vértice: el
 * color real lo pone el material.
 */
export class VoxelGlyphs {
  private cache = new Map<string, THREE.BufferGeometry>();
  constructor(readonly voxel: number) {}

  get(ch: string): THREE.BufferGeometry {
    let g = this.cache.get(ch);
    if (!g) {
      const bits = GLYPHS[ch] ?? GLYPHS['0'];
      const rows = [0, 1, 2, 3, 4].map((r) => bits.slice(r * 3, r * 3 + 3));
      g = buildVoxelGeometry(spriteFromRows(rows, { '1': 0xffffff }, () => 0), this.voxel);
      this.cache.set(ch, g);
    }
    return g;
  }

  /** Ancho de un carácter más su separación. */
  get advance(): number {
    return this.voxel * 4;
  }

  dispose(): void {
    this.cache.forEach((g) => g.dispose());
    this.cache.clear();
  }
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  /** Aceleración hacia abajo por el eje `up` del sistema (negativa = sube, como una brasa). */
  gravity: number;
  color: THREE.Color;
}

/**
 * Partículas de cubos de color plano en un único InstancedMesh. `up` es el eje
 * vertical de la escena (Z en una pista vista desde arriba, Y en un pozo visto
 * de frente); con `floor`, rebotan al llegar a ese valor en ese eje.
 */
export class VoxelParticles {
  readonly mesh: THREE.InstancedMesh;
  private list: Array<Particle & { max: number }> = [];
  private tmp = new THREE.Object3D();

  constructor(
    private max: number,
    private up: 'y' | 'z',
    private floor: number | null = null,
  ) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  spawn(p: Particle): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ ...p, max: p.life });
  }

  /** Explosión de `count` cubos desde un punto, en todas direcciones (o hacia `dirX` si no es 0). */
  burst(x: number, y: number, z: number, count: number, color: THREE.Color, speed: number, opts: { dirX?: number; lift?: number; gravity?: number; size?: number } = {}): void {
    const { dirX = 0, lift = 50, gravity = 260, size = 1.2 } = opts;
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.75);
      let vx = Math.cos(a) * s;
      if (dirX !== 0) vx = Math.abs(vx) * dirX;
      const side = Math.sin(a) * s;
      const up = lift * (0.6 + Math.random() * 0.8);
      const c = color.clone().lerp(white, Math.random() * 0.4);
      const sz = size * (0.8 + Math.random() * 1.3);
      if (this.up === 'z') this.spawn({ x, y, z, vx, vy: side, vz: up, life: 0.5 + Math.random() * 0.5, size: sz, gravity, color: c });
      else this.spawn({ x, y, z, vx, vy: up, vz: side, life: 0.5 + Math.random() * 0.5, size: sz, gravity, color: c });
    }
  }

  update(dt: number): void {
    let n = 0;
    const tmp = this.tmp;
    this.list = this.list.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (this.up === 'z') p.vz -= p.gravity * dt;
      else p.vy -= p.gravity * dt;
      const half = p.size / 2;
      if (this.floor !== null && p.gravity > 0) {
        if (this.up === 'z' && p.z < this.floor + half) {
          p.z = this.floor + half;
          p.vz = Math.abs(p.vz) * 0.4;
          p.vx *= 0.6;
          p.vy *= 0.6;
        } else if (this.up === 'y' && p.y < this.floor + half) {
          p.y = this.floor + half;
          p.vy = Math.abs(p.vy) * 0.4;
          p.vx *= 0.6;
          p.vz *= 0.6;
        }
      }
      const k = p.life / p.max;
      tmp.position.set(p.x, p.y, p.z);
      tmp.rotation.set(p.life * 7, p.life * 5, 0);
      tmp.scale.setScalar(p.size * Math.min(1, k * 1.6));
      tmp.updateMatrix();
      this.mesh.setMatrixAt(n, tmp.matrix);
      this.mesh.setColorAt(n, p.color);
      n++;
      return true;
    });
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/**
 * Distancia mínima de la cámara a la que todos los `corners` caben en pantalla
 * (dentro de ±`margin` en coordenadas normalizadas). `place(d)` debe colocar la
 * cámara a esa distancia y actualizar su matriz.
 */
export function fitDistance(camera: THREE.Camera, corners: readonly THREE.Vector3[], place: (d: number) => void, margin = 0.97): number {
  const p = new THREE.Vector3();
  let lo = 1;
  let hi = 5000;
  for (let i = 0; i < 28; i++) {
    const d = (lo + hi) / 2;
    place(d);
    const fits = corners.every((c) => {
      // Delante de la cámara (el plano lejano no cuenta: si no, la búsqueda no sería monótona).
      if (p.copy(c).applyMatrix4(camera.matrixWorldInverse).z >= 0) return false;
      p.copy(c).project(camera);
      return Math.abs(p.x) <= margin && Math.abs(p.y) <= margin;
    });
    if (fits) hi = d;
    else lo = d;
  }
  return hi;
}

/** Esquinas de una caja (para `fitDistance`). */
export function boxCorners(min: THREE.Vector3, max: THREE.Vector3): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) out.push(new THREE.Vector3(x, y, z));
  return out;
}

/**
 * Libera geometrías, materiales y texturas de una escena y el contexto WebGL
 * del renderer: cada minijuego crea el suyo y hay que devolverlo al cerrarse.
 */
export function disposeScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  const textures = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of materials) {
      const map = (m as THREE.MeshLambertMaterial).map;
      if (map) textures.add(map);
      m.dispose();
    }
  });
  textures.forEach((t) => t.dispose());
  renderer.dispose();
  renderer.forceContextLoss();
}

/** WebGLRenderer de un minijuego: sin suavizado, píxel 1:1 (se escala por CSS) y sombras simples. */
export function createMinigameRenderer(canvas: HTMLCanvasElement, clear: number): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.setClearColor(clear);
  return renderer;
}
