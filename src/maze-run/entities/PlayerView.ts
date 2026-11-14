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
/**
 * Elevación (casillas) por cada unidad de escala extra: al crecer, el gigante
 * sube por encima de los muros para que no lo tapen en las vistas inclinadas.
 */
const GROW_LIFT = 0.3;

/** Pose completa del protagonista, para animaciones que lo sacan de su sitio (cinemáticas). */
export interface HeroPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Escala por eje (x negativa = reflejado mirando a la izquierda). */
  scale: THREE.Vector3;
  /** Apertura de la boca, de 0 (cerrada) a 1 (máxima). */
  mouth: number;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Figura 2.5D del protagonista: boca animada, orientación y animación de muerte. */
export class PlayerView {
  readonly mesh: THREE.Mesh;
  private deathTime = -1;

  /** Pose "en su sitio" (posición en el laberinto, orientación según su dirección y escala). */
  static restPose(player: Player, scale: number, out: HeroPose): HeroPose {
    out.position.set(worldX(player.x), player.y, ACTOR_Z + Math.max(0, scale - 1) * GROW_LIFT);
    out.quaternion.setFromAxisAngle(Z_AXIS, player.dir === Dir.Up ? Math.PI / 2 : player.dir === Dir.Down ? -Math.PI / 2 : 0);
    out.scale.set(player.dir === Dir.Left ? -scale : scale, scale, scale);
    out.mouth = 0.5;
    return out;
  }

  /** Coloca al protagonista según una pose externa (sin sombra: puede estar pegado a la cámara). */
  applyPose(pose: HeroPose): void {
    this.mesh.position.copy(pose.position);
    this.mesh.quaternion.copy(pose.quaternion);
    this.mesh.scale.copy(pose.scale);
    this.mesh.visible = true;
    this.mesh.castShadow = false;
    const frame = Math.round(Math.max(0, Math.min(1, pose.mouth)) * (MOUTH_FRAMES - 1)) / (MOUTH_FRAMES - 1);
    this.mesh.geometry = heroGeometry(frame * MAX_MOUTH);
  }

  constructor() {
    this.mesh = new THREE.Mesh(heroGeometry(MAX_MOUTH / 2), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.castShadow = true;
  }

  startDeath(): void {
    this.deathTime = 0;
  }

  /**
   * @param scale tamaño (1 = normal; el poder GIGANTE lo aumenta, el portal lo reduce).
   * @param spin giro extra en radianes (al ser absorbido por un portal).
   */
  update(dt: number, player: Player, scale = 1, spin = 0): void {
    this.mesh.castShadow = true;
    // Al crecer, se eleva para que no se hunda en el suelo: asoma por encima de los muros.
    this.mesh.position.set(worldX(player.x), player.y, ACTOR_Z + Math.max(0, scale - 1) * GROW_LIFT);

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
    this.mesh.scale.set(flip ? -scale : scale, scale, scale);
    this.mesh.rotation.set(0, 0, (player.dir === Dir.Up ? Math.PI / 2 : player.dir === Dir.Down ? -Math.PI / 2 : 0) + spin);
    this.mesh.visible = scale > 0.01;

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
