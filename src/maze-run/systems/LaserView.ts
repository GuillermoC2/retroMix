import * as THREE from 'three';
import { ACTOR_Z, worldX } from '../world';
import type { LaserBeam } from './Laser';

const OUTER = 0xff6a1a;
const CORE = 0xffd28a;
const SPARKS = 14;
const PULSES = 4;

interface Spark {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

/**
 * Rayo del láser: haz naranja con núcleo claro que vibra a saltos, destellos que
 * corren de la boca al muro, un fogonazo en la boca y chispas y luz naranja donde
 * choca. En los últimos segundos parpadea.
 */
export class LaserView {
  readonly group = new THREE.Group();
  private box = new THREE.BoxGeometry(1, 1, 1);
  private mat = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  private outerMaterial = this.mat(OUTER, 0.85);
  private coreMaterial = this.mat(CORE, 1);
  private sparkMaterial = this.mat(0xffb04a, 1);
  private outer = new THREE.Mesh(this.box, this.outerMaterial);
  private core = new THREE.Mesh(this.box, this.coreMaterial);
  private muzzle = new THREE.Mesh(this.box, this.coreMaterial);
  private impact = new THREE.Mesh(this.box, this.outerMaterial);
  private pulses = Array.from({ length: PULSES }, () => new THREE.Mesh(this.box, this.coreMaterial));
  private sparks: Spark[] = [];
  private light = new THREE.PointLight(OUTER, 0, 4.5, 1.5);
  private time = 0;
  private sparkTimer = 0;

  constructor() {
    this.group.add(this.outer, this.core, this.muzzle, this.impact, ...this.pulses, this.light);
    for (let i = 0; i < SPARKS; i++) {
      const mesh = new THREE.Mesh(this.box, this.sparkMaterial);
      mesh.visible = false;
      this.group.add(mesh);
      this.sparks.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    this.setBeamVisible(false);
  }

  /** @param beam rayo a dibujar, o null si no hay láser. @param warning últimos segundos (parpadea). */
  update(dt: number, beam: LaserBeam | null, warning: boolean): void {
    this.time += dt;
    this.updateSparks(dt);
    const on = !!beam && !(warning && Math.floor(this.time * 12) % 2 === 0);
    this.setBeamVisible(on);
    if (!beam || !on) return;

    const x0 = worldX(beam.x0);
    const x1 = worldX(beam.x1);
    const horizontal = beam.y0 === beam.y1;
    const len = Math.max(0.05, Math.hypot(x1 - x0, beam.y1 - beam.y0));
    const mx = (x0 + x1) / 2;
    const my = (beam.y0 + beam.y1) / 2;
    // Grosor que vibra a saltos (pixel art).
    const step = Math.floor(this.time * 18);
    const width = [0.34, 0.28, 0.38, 0.3][step % 4];
    const place = (m: THREE.Object3D, w: number, d: number) => {
      m.position.set(mx, my, ACTOR_Z);
      m.scale.set(horizontal ? len : w, horizontal ? w : len, d);
    };
    place(this.outer, width, 0.22);
    place(this.core, width * 0.4, 0.26);

    // Destellos que viajan de la boca al muro.
    const ux = (x1 - x0) / len;
    const uy = (beam.y1 - beam.y0) / len;
    this.pulses.forEach((p, i) => {
      const t = (this.time * 2.6 + i / PULSES) % 1;
      p.position.set(x0 + ux * len * t, beam.y0 + uy * len * t, ACTOR_Z);
      const s = width * 1.25;
      p.scale.set(horizontal ? 0.12 : s, horizontal ? s : 0.12, 0.3);
    });

    const flicker = step % 2 ? 1 : 0.8;
    this.muzzle.position.set(x0, beam.y0, ACTOR_Z);
    this.muzzle.scale.setScalar(0.42 * flicker);
    this.muzzle.rotation.z = Math.PI / 4;
    this.impact.position.set(x1, beam.y1, ACTOR_Z);
    this.impact.scale.setScalar(0.5 * flicker);
    this.impact.rotation.z = Math.floor(this.time * 10) * (Math.PI / 8);
    this.light.position.set(x1 - ux * 0.4, beam.y1 - uy * 0.4, ACTOR_Z + 0.5);
    this.light.intensity = 3 * flicker;

    // Chispas en el punto de impacto.
    this.sparkTimer -= dt;
    if (this.sparkTimer <= 0) {
      this.sparkTimer = 0.03;
      const s = this.sparks.find((q) => q.life <= 0);
      if (s) {
        const a = Math.random() * Math.PI * 2;
        const v = 2 + Math.random() * 2.5;
        s.vx = Math.cos(a) * v - ux * 2;
        s.vy = Math.sin(a) * v - uy * 2;
        s.vz = 1 + Math.random() * 2;
        s.life = 0.25 + Math.random() * 0.2;
        s.mesh.position.set(x1, beam.y1, ACTOR_Z);
        s.mesh.scale.setScalar(0.09);
        s.mesh.visible = true;
      }
    }
  }

  private updateSparks(dt: number): void {
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vz -= 9 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z = Math.max(0.05, s.mesh.position.z + s.vz * dt);
      s.mesh.visible = s.life > 0;
    }
  }

  private setBeamVisible(on: boolean): void {
    for (const m of [this.outer, this.core, this.muzzle, this.impact, ...this.pulses]) m.visible = on;
    if (!on) this.light.intensity = 0;
  }

  dispose(): void {
    this.box.dispose();
    this.outerMaterial.dispose();
    this.coreMaterial.dispose();
    this.sparkMaterial.dispose();
    this.light.dispose();
  }
}
