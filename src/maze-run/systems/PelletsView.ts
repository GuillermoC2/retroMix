import * as THREE from 'three';
import { DOT_COLOR, energizerGeometry } from '../entities/sprites';
import type { Chunk } from '../maze/Maze';
import { ACTOR_Z, worldX } from '../world';
import { PelletType, type Pellet, type Pellets } from './Pellets';

const DOT_SIZE = 0.16;

/** Puntos como cubos pixelados instanciados por sección; energizadores como esferas voxel que parpadean. */
export class PelletsView {
  readonly group = new THREE.Group();
  private dotGeometry = new THREE.BoxGeometry(DOT_SIZE, DOT_SIZE, DOT_SIZE);
  private dotMaterial = new THREE.MeshBasicMaterial({ color: DOT_COLOR });
  private energizerMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: DOT_COLOR, emissiveIntensity: 0.55 });
  private chunks = new Map<number, { dots: THREE.InstancedMesh; energizers: THREE.Mesh[] }>();
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private time = 0;
  private unsubscribe: Array<() => void>;

  constructor(pellets: Pellets) {
    this.unsubscribe = [
      pellets.events.on('chunkPopulated', ({ chunk, pellets: list }) => this.add(chunk, list)),
      pellets.events.on('eaten', (p) => this.hide(p)),
      pellets.events.on('chunkCleared', (c) => this.remove(c.index)),
    ];
  }

  update(dt: number): void {
    this.time += dt;
    const on = Math.floor(this.time * 4) % 2 === 0;
    const pulse = 1 + Math.sin(this.time * 10) * 0.08;
    for (const { energizers } of this.chunks.values()) {
      for (const e of energizers) {
        e.visible = on && e.userData.alive;
        e.scale.setScalar(pulse);
        e.rotation.y = this.time * 1.5;
      }
    }
  }

  private add(chunk: Chunk, pellets: Pellet[]): void {
    const dots = pellets.filter((p) => p.type === PelletType.Dot);
    const mesh = new THREE.InstancedMesh(this.dotGeometry, this.dotMaterial, Math.max(1, dots.length));
    const m = new THREE.Matrix4();
    dots.forEach((p) => mesh.setMatrixAt(p.slot, m.makeTranslation(worldX(p.x), p.y, ACTOR_Z)));
    mesh.count = dots.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);

    const energizers = pellets
      .filter((p) => p.type === PelletType.Energizer)
      .map((p) => {
        const e = new THREE.Mesh(energizerGeometry(), this.energizerMaterial);
        e.position.set(worldX(p.x), p.y, ACTOR_Z);
        e.userData.alive = true;
        e.userData.slot = p.slot;
        e.castShadow = true;
        this.group.add(e);
        return e;
      });
    this.chunks.set(chunk.index, { dots: mesh, energizers });
  }

  private hide(p: Pellet): void {
    const entry = this.chunks.get(p.chunk);
    if (!entry) return;
    if (p.type === PelletType.Dot) {
      entry.dots.setMatrixAt(p.slot, this.hidden);
      entry.dots.instanceMatrix.needsUpdate = true;
    } else {
      const e = entry.energizers.find((m) => m.userData.slot === p.slot);
      if (e) e.userData.alive = false;
    }
  }

  private remove(index: number): void {
    const entry = this.chunks.get(index);
    if (!entry) return;
    this.chunks.delete(index);
    this.group.remove(entry.dots, ...entry.energizers);
    entry.dots.dispose();
  }

  dispose(): void {
    this.unsubscribe.forEach((u) => u());
    [...this.chunks.keys()].forEach((i) => this.remove(i));
    this.dotGeometry.dispose();
    this.dotMaterial.dispose();
    this.energizerMaterial.dispose();
  }
}
