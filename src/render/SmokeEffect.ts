import * as THREE from 'three';

const MAX_PUFFS = 120;
const DRAG = 3.2;

interface Puff {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
  age: number;
  life: number;
}

const GRAYS = [0xffffff, 0xe4e4f0, 0xc8c8d8, 0xa8a8bc];

/**
 * Humo voxel: bocanadas cúbicas que salen en anillo desde un punto (p. ej. un
 * aterrizaje), se frenan, suben un poco, crecen y se deshacen en escalones.
 * El anillo va en el plano XY y sube por Z; en una escena con Y hacia arriba,
 * basta con girar `group` −90° en X (lo hace BLOQUES).
 */
export class SmokeEffect {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private puffs: Puff[] = [];
  private next = 0;
  private matrix = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ emissive: 0x303040 }), MAX_PUFFS);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_PUFFS; i++) {
      this.mesh.setMatrixAt(i, this.hidden);
      this.mesh.setColorAt(i, this.color.set(0xffffff));
      this.puffs.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0, age: 0, life: 1 });
    }
    this.group.add(this.mesh);
  }

  /**
   * Anillo de humo alrededor de (x, y) a la altura z.
   * @param radius radio inicial del anillo (casillas).
   * @param count número de bocanadas.
   * @param size multiplicador del tamaño de las bocanadas (y de su velocidad).
   */
  ring(x: number, y: number, z: number, radius: number, count: number, size = 1): void {
    for (let n = 0; n < count; n++) {
      const a = (n / count) * Math.PI * 2 + rand(-0.2, 0.2);
      const r = radius * rand(0.8, 1.15);
      const speed = rand(2.5, 6) * size;
      const i = this.next;
      this.next = (this.next + 1) % MAX_PUFFS;
      const p = this.puffs[i];
      p.alive = true;
      p.pos.set(x + Math.cos(a) * r, y + Math.sin(a) * r, z + rand(-0.2, 0.3));
      p.vel.set(Math.cos(a) * speed, Math.sin(a) * speed, rand(0.6, 2));
      p.size = rand(0.45, 0.9) * Math.max(1, radius / 1.4) * size;
      p.age = 0;
      p.life = rand(0.7, 1.2);
      this.mesh.setColorAt(i, this.color.setHex(GRAYS[n % GRAYS.length]));
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number): void {
    let dirty = false;
    for (let i = 0; i < MAX_PUFFS; i++) {
      const p = this.puffs[i];
      if (!p.alive) continue;
      dirty = true;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        this.mesh.setMatrixAt(i, this.hidden);
        continue;
      }
      p.vel.multiplyScalar(Math.exp(-DRAG * dt));
      p.pos.addScaledVector(p.vel, dt);
      // Crece al principio y se deshace al final, en escalones (pixel art).
      const k = p.age / p.life;
      const grow = k < 0.25 ? 0.6 + (k / 0.25) * 0.4 : 1 - (k - 0.25) / 0.75;
      const s = (p.size * Math.ceil(grow * 5)) / 5;
      this.mesh.setMatrixAt(i, this.matrix.compose(p.pos, this.quat, this.scale.set(s, s, s)));
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
