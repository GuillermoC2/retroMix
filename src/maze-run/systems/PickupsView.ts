import * as THREE from 'three';
import { ICE_COLOR, LASER_COLOR, iceCubeGeometry, laserOrbGeometry } from '../entities/sprites';
import { ACTOR_Z, worldX } from '../world';
import type { Pickup, PickupKind, Pickups } from './Pickups';

/**
 * Objetos de habilidad: el cubito de hielo flota y se balancea mirando a cámara;
 * la bola del láser gira y late con un brillo naranja.
 */
export class PickupsView {
  readonly group = new THREE.Group();
  private materials: Record<PickupKind, THREE.MeshLambertMaterial> = {
    ice: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: ICE_COLOR, emissiveIntensity: 0.2 }),
    laser: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: LASER_COLOR, emissiveIntensity: 0.5 }),
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
    const t = this.time;
    // La bola late (como los energizadores, pero en naranja).
    this.materials.laser.emissiveIntensity = 0.45 + (Math.floor(t * 6) % 2) * 0.35;
    for (const [p, mesh] of this.meshes) {
      const phase = p.id * 1.7;
      if (p.kind === 'ice') {
        mesh.position.z = ACTOR_Z + 0.08 + Math.sin(t * 3 + phase) * 0.06;
        // Se balancea mirando a cámara (girando entero se veía casi siempre el canto claro).
        mesh.rotation.set(Math.sin(t * 1.7 + phase) * 0.35, Math.sin(t * 1.3 + phase) * 0.6, Math.sin(t * 2.1 + phase) * 0.12);
        mesh.scale.setScalar(Math.sin(t * 2 + phase) > 0.97 ? 1.12 : 1);
      } else {
        mesh.position.z = ACTOR_Z + 0.05 + Math.sin(t * 4 + phase) * 0.05;
        mesh.rotation.set(0, t * 2.4 + phase, 0);
        mesh.scale.setScalar(1 + Math.sin(t * 10 + phase) * 0.07);
      }
    }
  }

  private add(p: Pickup): void {
    const geometry = p.kind === 'ice' ? iceCubeGeometry() : laserOrbGeometry();
    const mesh = new THREE.Mesh(geometry, this.materials[p.kind]);
    mesh.position.set(worldX(p.x), p.y, ACTOR_Z);
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
    Object.values(this.materials).forEach((m) => m.dispose());
  }
}
