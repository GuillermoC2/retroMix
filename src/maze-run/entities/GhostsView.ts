import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { GhostDirector } from '../systems/GhostDirector';
import { ACTOR_Z, worldX } from '../world';
import type { Ghost } from './Ghost';
import { FLASH_BODY, FLASH_FACE, SCARED_BODY, SCARED_FACE, ghostGeometry, type GhostLook } from './sprites';

/** Una malla voxel por fantasma; cambia de geometría según estado, mirada y fotograma del faldón. */
export class GhostsView {
  readonly group = new THREE.Group();
  private meshes = new Map<Ghost, THREE.Mesh>();
  private material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private time = 0;

  update(dt: number, director: GhostDirector): void {
    this.time += dt;
    const alive = new Set(director.ghosts);
    for (const [g, mesh] of this.meshes) {
      if (!alive.has(g)) {
        this.group.remove(mesh);
        this.meshes.delete(g);
      }
    }

    const flashing = director.frightTimer > 0 && director.frightTimer < CONFIG.ghosts.frightFlashTime;
    const flashOn = flashing && Math.floor(this.time * 5) % 2 === 0;

    for (const g of director.ghosts) {
      let mesh = this.meshes.get(g);
      if (!mesh) {
        mesh = new THREE.Mesh(undefined, this.material);
        mesh.castShadow = true;
        this.meshes.set(g, mesh);
        this.group.add(mesh);
      }
      const frame = (Math.floor(this.time * 7 + g.id) % 2) as 0 | 1;
      let look: GhostLook;
      if (g.state === 'frightened') {
        look = { body: flashOn ? FLASH_BODY : SCARED_BODY, frame, face: 'scared', faceColor: flashOn ? FLASH_FACE : SCARED_FACE };
      } else if (g.state === 'eaten') {
        look = { body: null, frame, face: g.dir };
      } else {
        look = { body: g.personality.color, frame, face: g.dir };
      }
      mesh.geometry = ghostGeometry(look);

      const bob = g.state === 'eaten' ? 0 : Math.sin(this.time * 6 + g.id) * 0.04;
      mesh.position.set(worldX(g.x), g.y + bob, ACTOR_Z);
      const s = g.state === 'spawning' ? Math.min(1, g.stateTime / 0.7) : 1;
      mesh.scale.set(s, s, s);
      mesh.rotation.y = g.state === 'spawning' ? (1 - s) * Math.PI * 2 : 0;
    }
  }

  dispose(): void {
    this.material.dispose();
  }
}
