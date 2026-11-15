import * as THREE from 'three';
import { CONFIG } from '../../config';
import { DOT_COLOR, MAGNET_COLOR } from '../entities/sprites';
import { ACTOR_Z, worldX } from '../world';

interface Flying {
  mesh: THREE.Mesh;
  fromX: number;
  fromY: number;
  t: number;
}

const DOT_SIZE = 0.16;

/**
 * Imán: los puntos atraídos vuelan acelerando hasta el protagonista, y un aro
 * rojo marca el radio con ondas que se cierran hacia él. En los últimos segundos
 * el aro parpadea.
 */
export class MagnetEffect {
  readonly group = new THREE.Group();
  private dotGeometry = new THREE.BoxGeometry(DOT_SIZE, DOT_SIZE, DOT_SIZE);
  private dotMaterial = new THREE.MeshBasicMaterial({ color: DOT_COLOR });
  private flying: Flying[] = [];
  private pool: THREE.Mesh[] = [];
  private ringMaterial = new THREE.MeshBasicMaterial({ color: MAGNET_COLOR, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
  private waveMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  private ring: THREE.Mesh;
  private waves: THREE.Mesh[];
  private time = 0;

  constructor() {
    const r = CONFIG.abilities.magnet.radius;
    // Pocos segmentos: aro pixelado.
    this.ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.1, r, 24), this.ringMaterial);
    this.waves = [0, 1].map(() => new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r, 24), this.waveMaterial));
    this.group.add(this.ring, ...this.waves);
    this.setRingVisible(false);
  }

  /** Puntos atraídos este fotograma (casillas). */
  pull(tiles: ReadonlyArray<{ x: number; y: number }>): void {
    for (const t of tiles) {
      const mesh = this.pool.pop() ?? new THREE.Mesh(this.dotGeometry, this.dotMaterial);
      mesh.position.set(worldX(t.x), t.y, ACTOR_Z);
      mesh.visible = true;
      this.group.add(mesh);
      this.flying.push({ mesh, fromX: worldX(t.x), fromY: t.y, t: 0 });
    }
  }

  /** @param player posición del protagonista (casillas) o null si no hay imán activo. */
  update(dt: number, player: { x: number; y: number }, active: boolean, warning: boolean): void {
    this.time += dt;
    const px = worldX(player.x);
    const { flyTime } = CONFIG.abilities.magnet;
    for (const f of [...this.flying]) {
      f.t += dt / flyTime;
      if (f.t >= 1) {
        this.flying.splice(this.flying.indexOf(f), 1);
        f.mesh.visible = false;
        this.group.remove(f.mesh);
        this.pool.push(f.mesh);
        continue;
      }
      const k = f.t * f.t; // acelera al acercarse
      f.mesh.position.set(f.fromX + (px - f.fromX) * k, f.fromY + (player.y - f.fromY) * k, ACTOR_Z + Math.sin(f.t * Math.PI) * 0.4);
    }

    const on = active && !(warning && Math.floor(this.time * 8) % 2 === 0);
    this.setRingVisible(on);
    if (!on) return;
    const z = CONFIG.maze.wallDepth + 0.05;
    this.ring.position.set(px, player.y, z);
    this.ring.rotation.z = Math.floor(this.time * 6) * (Math.PI / 24);
    this.waves.forEach((w, i) => {
      // Ondas que se cierran hacia el protagonista, en escalones.
      const t = (this.time * 1.4 + i / 2) % 1;
      w.position.set(px, player.y, z);
      w.scale.setScalar(Math.max(0.12, Math.round((1 - t) * 8) / 8));
    });
  }

  private setRingVisible(on: boolean): void {
    this.ring.visible = on;
    this.waves.forEach((w) => (w.visible = on));
  }

  dispose(): void {
    this.dotGeometry.dispose();
    this.dotMaterial.dispose();
    this.ring.geometry.dispose();
    this.waves.forEach((w) => w.geometry.dispose());
    this.ringMaterial.dispose();
    this.waveMaterial.dispose();
  }
}
