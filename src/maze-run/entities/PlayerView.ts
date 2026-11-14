import * as THREE from 'three';
import { CONFIG } from '../../config';
import { Dir } from '../maze/grid';
import { ACTOR_Z, worldX } from '../world';
import type { Player } from './Player';
import { heroGeometry } from './sprites';

const MAX_MOUTH = (80 * Math.PI) / 180;
/** Fotogramas de boca (pocos, como un sprite arcade). */
const MOUTH_FRAMES = 4;
/** Casillas recorridas por cada ciclo abrir/cerrar. */
const CHOMP_LENGTH = 0.9;

/** Figura 2.5D del protagonista: boca animada, orientación y animación de muerte. */
export class PlayerView {
  readonly mesh: THREE.Mesh;
  private deathTime = -1;

  constructor() {
    this.mesh = new THREE.Mesh(heroGeometry(MAX_MOUTH / 2), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.castShadow = true;
  }

  startDeath(): void {
    this.deathTime = 0;
  }

  update(dt: number, player: Player): void {
    this.mesh.position.set(worldX(player.x), player.y, ACTOR_Z);

    if (this.deathTime >= 0) {
      this.deathTime += dt;
      const t = Math.min(1, this.deathTime / (CONFIG.player.deathDuration * 0.8));
      // Mira hacia arriba y la boca se abre hasta desaparecer.
      this.mesh.rotation.set(0, 0, Math.PI / 2);
      this.mesh.scale.set(1, 1, 1);
      const mouth = MAX_MOUTH + (Math.PI * 2 - MAX_MOUTH) * t;
      this.mesh.geometry = heroGeometry(Math.round(mouth / 0.25) * 0.25);
      this.mesh.visible = t < 1;
      return;
    }

    // Orientación: a la izquierda se refleja (el ojo queda arriba); arriba/abajo se rota.
    const flip = player.dir === Dir.Left;
    this.mesh.scale.set(flip ? -1 : 1, 1, 1);
    this.mesh.rotation.set(0, 0, player.dir === Dir.Up ? Math.PI / 2 : player.dir === Dir.Down ? -Math.PI / 2 : 0);

    let open = 0.5;
    if (player.moving) {
      const phase = (player.travelled / CHOMP_LENGTH) % 1;
      open = 1 - Math.abs(phase * 2 - 1); // triángulo 0→1→0
    }
    const frame = Math.round(open * (MOUTH_FRAMES - 1)) / (MOUTH_FRAMES - 1);
    this.mesh.geometry = heroGeometry(frame * MAX_MOUTH);
  }

  dispose(): void {
    (this.mesh.material as THREE.Material).dispose();
  }
}
