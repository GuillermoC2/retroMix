import * as THREE from 'three';

const COUNT = 4;
const MAX_CUBES = 4 * 140;
const MAX_VEINS = 4 * 60;
/** Cuerpo rojo oscuro con variaciones; venas de un rojo más vivo que brillan (sin sombreado). */
const BODY_COLORS = [0x7a0010, 0x8e0616, 0x620009, 0x9a0a1c];
const VEIN_COLORS = [0xff2a3c, 0xff4a5a, 0xff8090];
/** Ejes por los que asoman las venas (alineados con la rejilla: aspecto voxel). */
const VEIN_DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1],
];

/**
 * Cuatro tentáculos de vóxeles (poder GHOUL): a lo largo de cada curva se colocan
 * cubos alineados con una rejilla, cada vez más pequeños hacia la punta, con
 * cubitos de vena brillantes en la superficie. Sin superficies lisas.
 *
 * Uso por fotograma: `set()` por cada tentáculo que se quiera dibujar y, al final,
 * `flush()` (si nadie llamó a `set`, se ocultan).
 */
export class TentacleView {
  readonly group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private veins: THREE.InstancedMesh;
  private nBody = 0;
  private nVeins = 0;
  private matrix = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private color = new THREE.Color();
  private p = new THREE.Vector3();

  constructor() {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.body = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ emissive: 0x2a0004 }), MAX_CUBES);
    this.veins = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial(), MAX_VEINS);
    for (const m of [this.body, this.veins]) {
      m.frustumCulled = false;
      m.count = 0;
      m.setColorAt(0, this.color.set(0xffffff));
    }
    this.body.castShadow = true;
    this.group.add(this.body, this.veins);
    this.group.visible = false;
  }

  /**
   * Añade el tentáculo `i` a lo largo de `curve`.
   * @param r0 radio en la base y `r1` en la punta (casillas); el cubo más pequeño mide 2·r1.
   * @param length fracción de la curva que se dibuja (0 = recogido, 1 = entero).
   */
  set(i: number, curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, length = 1): void {
    if (length <= 0.02) return;
    const v = Math.max(0.05, r1 * 1.2); // tamaño de la rejilla
    const total = curve.getLength() * length;
    const steps = Math.max(2, Math.ceil(total / (v * 0.75)));
    let lastKey = '';
    for (let s = 0; s <= steps; s++) {
      const u = (s / steps) * length;
      curve.getPointAt(Math.min(1, u), this.p);
      const radius = r0 + (r1 - r0) * (s / steps);
      const size = Math.max(v, Math.round((radius * 2) / v) * v);
      // Ajuste a la rejilla: cubos alineados, sin giros.
      const gx = Math.round(this.p.x / v);
      const gy = Math.round(this.p.y / v);
      const gz = Math.round(this.p.z / v);
      const key = `${gx},${gy},${gz},${size}`;
      if (key === lastKey) continue;
      lastKey = key;
      this.pos.set(gx * v, gy * v, gz * v);
      const hash = Math.abs(gx * 73 + gy * 151 + gz * 37 + i * 11);
      this.addCube(this.body, this.nBody++, MAX_CUBES, this.pos, size, BODY_COLORS[hash % BODY_COLORS.length]);
      // Venas: cubitos en la superficie, cada pocos pasos, por ejes de la rejilla.
      if (s % 3 === i % 3 && size > v * 1.5) {
        const [dx, dy, dz] = VEIN_DIRS[(s + i * 2) % VEIN_DIRS.length];
        const off = size / 2;
        this.pos.set(gx * v + dx * off, gy * v + dy * off, gz * v + dz * off);
        this.addCube(this.veins, this.nVeins++, MAX_VEINS, this.pos, v, VEIN_COLORS[hash % VEIN_COLORS.length]);
      }
    }
  }

  /** Aplica lo añadido en este fotograma (o lo oculta si no hubo nada) y prepara el siguiente. */
  flush(): void {
    this.body.count = Math.min(this.nBody, MAX_CUBES);
    this.veins.count = Math.min(this.nVeins, MAX_VEINS);
    this.group.visible = this.nBody > 0;
    for (const m of [this.body, this.veins]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.nBody = 0;
    this.nVeins = 0;
  }

  private addCube(mesh: THREE.InstancedMesh, index: number, max: number, at: THREE.Vector3, size: number, color: number): void {
    if (index >= max) return;
    mesh.setMatrixAt(index, this.matrix.compose(at, this.quat, this.scale.set(size, size, size)));
    mesh.setColorAt(index, this.color.setHex(color));
  }

  dispose(): void {
    this.body.geometry.dispose();
    (this.body.material as THREE.Material).dispose();
    (this.veins.material as THREE.Material).dispose();
    this.body.dispose();
    this.veins.dispose();
  }
}

export const TENTACLE_COUNT = COUNT;
