import * as THREE from 'three';

const COPIES = 7;
const LIFE = 0.24;
const EVERY = 0.022;
const COLOR = 0x6fc8ff;

interface Copy {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
}

/**
 * Estela del dash: copias azules brillantes del protagonista que se quedan atrás
 * y se desvanecen a saltos.
 */
export class DashTrail {
  readonly group = new THREE.Group();
  private copies: Copy[] = [];
  private timer = 0;
  private next = 0;

  constructor() {
    for (let i = 0; i < COPIES; i++) {
      const material = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(undefined, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.copies.push({ mesh, material, life: 0 });
    }
  }

  /** @param source malla del protagonista (se copia su forma y posición). @param emitting en pleno dash. */
  update(dt: number, source: THREE.Mesh, emitting: boolean): void {
    for (const c of this.copies) {
      if (c.life <= 0) continue;
      c.life -= dt;
      // Se desvanece en 4 escalones.
      c.material.opacity = (Math.ceil((Math.max(0, c.life) / LIFE) * 4) / 4) * 0.8;
      c.mesh.visible = c.life > 0;
    }
    if (!emitting) {
      this.timer = 0;
      return;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = EVERY;
    const c = this.copies[this.next];
    this.next = (this.next + 1) % COPIES;
    c.mesh.geometry = source.geometry;
    c.mesh.position.copy(source.position);
    c.mesh.quaternion.copy(source.quaternion);
    c.mesh.scale.copy(source.scale);
    c.life = LIFE;
    c.mesh.visible = true;
  }

  dispose(): void {
    this.copies.forEach((c) => c.material.dispose());
  }
}
