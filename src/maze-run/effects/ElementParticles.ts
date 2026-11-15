import * as THREE from 'three';

const MAX_PARTICLES = 1000;

/**
 * Tipos de partícula, cada uno con su rampa de color según la edad:
 * - `fire`: llama (blanco → amarillo → naranja → rojo → se apaga).
 * - `ember`: brasa (amarillo → naranja → rojo oscuro).
 * - `ice`: rocío de hielo (blanco → celeste → azul).
 * - `frost`: escarcha y copos (blanco azulado, casi sin cambiar).
 */
export type ParticleKind = 'fire' | 'ember' | 'ice' | 'frost';

const RAMPS: Record<ParticleKind, ReadonlyArray<[number, number]>> = {
  fire: [[0.1, 0xfff4c0], [0.28, 0xffd23a], [0.5, 0xff8a1a], [0.75, 0xe8341a], [1, 0x5a1408]],
  ember: [[0.3, 0xffd23a], [0.65, 0xff6a1a], [1, 0xa0200a]],
  ice: [[0.15, 0xffffff], [0.45, 0xbff0ff], [0.75, 0x6fc8ff], [1, 0x2f7fd0]],
  frost: [[0.6, 0xe8fbff], [1, 0x9fdcff]],
};

export interface EmitOptions {
  /** Aceleración vertical (Z, casillas/s²): negativa cae, positiva sube. */
  gravity?: number;
  /** Frenado (fracción de velocidad perdida por segundo, exponencial). */
  drag?: number;
  /** Cuánto crece a lo largo de su vida (0 = nada, 1 = el doble). */
  grow?: number;
}

interface Particle {
  alive: boolean;
  kind: ParticleKind;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
  age: number;
  life: number;
  gravity: number;
  drag: number;
  grow: number;
  spin: number;
}

/**
 * Partículas voxel brillantes (mezcla aditiva) para el fuego y el hielo del poder
 * FUEGO HIELO: llamaradas, rocío de hielo, brasas y escarcha. Cubos que cambian
 * de color con la edad, crecen o encogen en escalones (pixel art) y se apagan.
 */
export class ElementParticles {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private next = 0;
  private matrix = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private ramps: Record<ParticleKind, Array<[number, THREE.Color]>>;

  constructor() {
    const material = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, MAX_PARTICLES);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.mesh.setMatrixAt(i, this.hidden);
      this.mesh.setColorAt(i, this.color.set(0xffffff));
      this.particles.push({
        alive: false,
        kind: 'fire',
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        size: 0,
        age: 0,
        life: 1,
        gravity: 0,
        drag: 0,
        grow: 0,
        spin: 0,
      });
    }
    this.ramps = Object.fromEntries(
      Object.entries(RAMPS).map(([k, stops]) => [k, stops.map(([at, hex]) => [at, new THREE.Color(hex)] as [number, THREE.Color])]),
    ) as ElementParticles['ramps'];
    this.group.add(this.mesh);
  }

  emit(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, opts: EmitOptions = {}): void {
    const p = this.particles[this.next];
    this.next = (this.next + 1) % MAX_PARTICLES;
    p.alive = true;
    p.kind = kind;
    p.pos.set(x, y, z);
    p.vel.set(vx, vy, vz);
    p.size = size;
    p.age = 0;
    p.life = life;
    p.gravity = opts.gravity ?? 0;
    p.drag = opts.drag ?? 0;
    p.grow = opts.grow ?? 0;
    p.spin = Math.random() * Math.PI;
  }

  /** Explosión de partículas en todas direcciones alrededor de un punto. */
  burst(kind: ParticleKind, x: number, y: number, z: number, count: number, speed: number, size: number, life: number, opts: EmitOptions = {}): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.emit(kind, x, y, z, Math.cos(a) * v, Math.sin(a) * v, rand(0.5, 1.5) * speed * 0.5, size * rand(0.7, 1.2), life * rand(0.7, 1.2), opts);
    }
  }

  update(dt: number): void {
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      dirty = true;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        this.mesh.setMatrixAt(i, this.hidden);
        continue;
      }
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.z += p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = p.age / p.life;
      // Crece con la edad y se encoge al final, en escalones.
      const shrink = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const s = (p.size * (1 + p.grow * k) * Math.ceil(shrink * 4)) / 4;
      this.euler.set(p.spin, p.spin * 0.7, p.spin * 1.3);
      this.mesh.setMatrixAt(i, this.matrix.compose(p.pos, this.quat.setFromEuler(this.euler), this.scale.set(s, s, s)));
      this.mesh.setColorAt(i, this.rampColor(p.kind, k));
    }
    if (dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }

  /** Color de la rampa en escalones (sin degradado: pixel art). */
  private rampColor(kind: ParticleKind, k: number): THREE.Color {
    const ramp = this.ramps[kind];
    for (const [at, c] of ramp) if (k <= at) return this.color.copy(c);
    return this.color.copy(ramp[ramp.length - 1][1]);
  }

  clear(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i].alive = false;
      this.mesh.setMatrixAt(i, this.hidden);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
