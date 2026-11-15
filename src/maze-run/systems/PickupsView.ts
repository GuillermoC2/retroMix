import * as THREE from 'three';
import {
  FEATHER_COLOR,
  ICE_COLOR,
  LASER_COLOR,
  MAGNET_COLOR,
  featherGeometry,
  iceCubeGeometry,
  laserOrbGeometry,
  magnetGeometry,
} from '../entities/sprites';
import { ACTOR_Z, worldX } from '../world';
import type { Pickup, PickupKind, Pickups } from './Pickups';

/** Aspecto y animación de cada tipo de objeto. */
interface PickupStyle {
  geometry: () => THREE.BufferGeometry;
  material: THREE.MeshLambertMaterial;
  animate: (mesh: THREE.Mesh, t: number) => void;
}

const glow = (color: number, intensity: number) =>
  new THREE.MeshLambertMaterial({ vertexColors: true, emissive: color, emissiveIntensity: intensity });

/**
 * Objetos de habilidad: el cubito de hielo flota y se balancea mirando a cámara;
 * la bola del láser gira y late con brillo naranja; la pluma se mece como si
 * cayera; el imán bota y se inclina a un lado y a otro.
 */
export class PickupsView {
  readonly group = new THREE.Group();
  private styles: Record<PickupKind, PickupStyle> = {
    ice: {
      geometry: iceCubeGeometry,
      material: glow(ICE_COLOR, 0.2),
      animate: (m, t) => {
        m.position.z = ACTOR_Z + 0.08 + Math.sin(t * 3) * 0.06;
        // Se balancea mirando a cámara (girando entero se veía casi siempre el canto claro).
        m.rotation.set(Math.sin(t * 1.7) * 0.35, Math.sin(t * 1.3) * 0.6, Math.sin(t * 2.1) * 0.12);
        m.scale.setScalar(Math.sin(t * 2) > 0.97 ? 1.12 : 1);
      },
    },
    laser: {
      geometry: laserOrbGeometry,
      material: glow(LASER_COLOR, 0.5),
      animate: (m, t) => {
        m.position.z = ACTOR_Z + 0.05 + Math.sin(t * 4) * 0.05;
        m.rotation.set(0, t * 2.4, 0);
        m.scale.setScalar(1 + Math.sin(t * 10) * 0.07);
      },
    },
    dash: {
      geometry: featherGeometry,
      material: glow(FEATHER_COLOR, 0.3),
      animate: (m, t) => {
        // Se mece de lado a lado, como una pluma que cae.
        m.position.x = m.userData.x + Math.sin(t * 2.2) * 0.12;
        m.position.z = ACTOR_Z + 0.12 + Math.abs(Math.sin(t * 2.2)) * 0.08;
        m.rotation.set(0.3, 0, Math.sin(t * 2.2) * 0.45);
      },
    },
    magnet: {
      geometry: magnetGeometry,
      material: glow(MAGNET_COLOR, 0.25),
      animate: (m, t) => {
        m.position.z = ACTOR_Z + 0.06 + Math.abs(Math.sin(t * 3.5)) * 0.1;
        m.rotation.set(0.25, Math.sin(t * 1.6) * 0.5, Math.sin(t * 3.5) * 0.15);
      },
    },
  };
  private meshes = new Map<Pickup, THREE.Mesh>();
  private time = 0;
  private unsubscribe: Array<() => void>;

  constructor(pickups: Pickups) {
    this.unsubscribe = [
      pickups.events.on('added', (p) => this.add(p)),
      pickups.events.on('removed', (p) => this.remove(p)),
    ];
  }

  update(dt: number): void {
    this.time += dt;
    // La bola del láser late (como los energizadores, pero en naranja).
    this.styles.laser.material.emissiveIntensity = 0.45 + (Math.floor(this.time * 6) % 2) * 0.35;
    for (const [p, mesh] of this.meshes) this.styles[p.kind].animate(mesh, this.time + p.id * 1.7);
  }

  private add(p: Pickup): void {
    const style = this.styles[p.kind];
    const mesh = new THREE.Mesh(style.geometry(), style.material);
    mesh.position.set(worldX(p.x), p.y, ACTOR_Z);
    mesh.userData.x = worldX(p.x);
    mesh.castShadow = true;
    this.meshes.set(p, mesh);
    this.group.add(mesh);
  }

  private remove(p: Pickup): void {
    const mesh = this.meshes.get(p);
    if (!mesh) return;
    this.group.remove(mesh);
    this.meshes.delete(p);
  }

  dispose(): void {
    this.unsubscribe.forEach((u) => u());
    Object.values(this.styles).forEach((s) => s.material.dispose());
  }
}
