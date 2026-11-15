import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { GhostDirector } from '../systems/GhostDirector';
import { ACTOR_Z, worldX } from '../world';
import type { Ghost } from './Ghost';
import { FLASH_BODY, FLASH_FACE, ICE_BODY, SCARED_BODY, SCARED_FACE, ghostGeometry, type GhostLook } from './sprites';

interface GhostMeshes {
  body: THREE.Mesh;
  /** Bloque de hielo translúcido que lo envuelve mientras está congelado. */
  ice: THREE.Mesh;
}

/**
 * Una malla voxel por fantasma; cambia de geometría según estado, mirada y
 * fotograma del faldón. Congelados: quietos dentro de un bloque de hielo, con el
 * cuerpo azul hielo (o de susto si están asustados); al final tiemblan y
 * parpadean con su color antes de soltarse.
 */
export class GhostsView {
  readonly group = new THREE.Group();
  private meshes = new Map<Ghost, GhostMeshes>();
  private material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private iceGeometry = new THREE.BoxGeometry(1.0, 1.0, 0.62);
  private iceEdges = new THREE.EdgesGeometry(this.iceGeometry);
  private iceMaterial = new THREE.MeshLambertMaterial({
    color: 0xbff0ff,
    emissive: 0x4ab8ff,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  private iceEdgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  private time = 0;

  update(dt: number, director: GhostDirector): void {
    this.time += dt;
    const alive = new Set(director.ghosts);
    for (const [g, m] of this.meshes) {
      if (!alive.has(g)) {
        this.group.remove(m.body, m.ice);
        this.meshes.delete(g);
      }
    }

    const flashing = director.frightTimer > 0 && director.frightTimer < CONFIG.ghosts.frightFlashTime;
    const flashOn = flashing && Math.floor(this.time * 5) % 2 === 0;
    const frozen = director.frozen;
    const thawing = frozen && director.freezeTimer < CONFIG.abilities.ice.thawWarning;
    const thawFlash = thawing && Math.floor(this.time * 8) % 2 === 0;

    for (const g of director.ghosts) {
      let m = this.meshes.get(g);
      if (!m) {
        const body = new THREE.Mesh(undefined, this.material);
        body.castShadow = true;
        const ice = new THREE.Mesh(this.iceGeometry, this.iceMaterial);
        ice.add(new THREE.LineSegments(this.iceEdges, this.iceEdgeMaterial));
        ice.renderOrder = 1;
        m = { body, ice };
        this.meshes.set(g, m);
        this.group.add(body, ice);
      }
      const isFrozen = frozen && g.state !== 'eaten';
      const frame = isFrozen ? 0 : ((Math.floor(this.time * 7 + g.id) % 2) as 0 | 1);
      let look: GhostLook;
      if (g.state === 'eaten') {
        look = { body: null, frame, face: g.dir };
      } else if (isFrozen && !thawFlash) {
        // Asustado y congelado: se ve asustado (se puede comer) dentro del hielo.
        look = g.state === 'frightened' ? { body: SCARED_BODY, frame, face: 'scared', faceColor: SCARED_FACE } : { body: ICE_BODY, frame, face: g.dir };
      } else if (g.state === 'frightened') {
        look = { body: flashOn ? FLASH_BODY : SCARED_BODY, frame, face: 'scared', faceColor: flashOn ? FLASH_FACE : SCARED_FACE };
      } else {
        look = { body: g.personality.color, frame, face: g.dir };
      }
      m.body.geometry = ghostGeometry(look);

      const bob = g.state === 'eaten' || isFrozen ? 0 : Math.sin(this.time * 6 + g.id) * 0.04;
      // Al descongelarse tiemblan.
      const shake = thawing && isFrozen ? Math.sin(this.time * 70 + g.id * 3) * 0.04 : 0;
      m.body.position.set(worldX(g.x) + shake, g.y + bob, ACTOR_Z);
      const s = g.state === 'spawning' ? Math.min(1, g.stateTime / 0.7) : 1;
      m.body.scale.set(s, s, s);
      m.body.rotation.y = g.state === 'spawning' ? (1 - s) * Math.PI * 2 : 0;

      m.ice.visible = isFrozen;
      if (isFrozen) {
        m.ice.position.set(worldX(g.x) + shake, g.y, ACTOR_Z);
        m.ice.scale.setScalar(s);
      }
    }
  }

  dispose(): void {
    this.material.dispose();
    this.iceGeometry.dispose();
    this.iceEdges.dispose();
    this.iceMaterial.dispose();
    this.iceEdgeMaterial.dispose();
  }
}
