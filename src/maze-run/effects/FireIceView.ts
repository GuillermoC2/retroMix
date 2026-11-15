import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Maze } from '../maze/Maze';
import { DX, DY, Tile } from '../maze/grid';
import type { FireIce, Flame } from '../systems/FireIce';
import { ACTOR_Z, worldX } from '../world';
import { rand, type ElementParticles } from './ElementParticles';

const MAX_ICE = 900;
const ICE_COLORS = [0xbfefff, 0xa8e4ff, 0xd8f6ff, 0x9fdcff].map((c) => new THREE.Color(c));
const SPIKE_COLOR = new THREE.Color(0xf4fdff);
/** Tiempo (s) en que una casilla de hielo cuaja del todo (en escalones). */
const APPEAR = 0.12;

/** Casillas que se puede avanzar desde la columna x en horizontal (dx) sin salir del laberinto. */
const toEdge = (x: number, dx: number): number =>
  dx > 0 ? CONFIG.maze.width - 1.5 - x : dx < 0 ? x - 0.5 : Infinity;

/**
 * Aspecto del poder FUEGO HIELO en el laberinto:
 * - hielo: losas translúcidas sobre el suelo (y escarcha sobre los bloques) con
 *   cristales que asoman; cuajan al pasar el frente y se derriten encogiendo;
 * - rocío del disparo de hielo y llamas de la llamarada (partículas), con luz;
 * - aura del protagonista: brasas que suben de su lado en llamas y escarcha que
 *   cae de su lado helado; destellos al deslizarse sobre el hielo.
 */
export class FireIceView {
  readonly group = new THREE.Group();
  private box = new THREE.BoxGeometry(1, 1, 1);
  private slabMaterial = new THREE.MeshLambertMaterial({ emissive: 0x16486a, transparent: true, opacity: 0.86 });
  private spikeMaterial = new THREE.MeshLambertMaterial({ emissive: 0x6a9ab0 });
  private slabs = new THREE.InstancedMesh(this.box, this.slabMaterial, MAX_ICE);
  private spikes = new THREE.InstancedMesh(this.box, this.spikeMaterial, MAX_ICE);
  private fireLight = new THREE.PointLight(0xff7a1a, 0, 6, 1.5);
  private iceLight = new THREE.PointLight(0x7fd8ff, 0, 6, 1.5);
  private matrix = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private spikeQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4);
  private pos = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private time = 0;
  private acc = { flame: 0, spray: 0, aura: 0, slide: 0 };
  /** Altura del protagonista (va más alto sobre la rampa de hielo): de ahí salen las llamas y el rocío. */
  private heroZ = ACTOR_Z;

  constructor(private particles: ElementParticles) {
    for (const m of [this.slabs, this.spikes]) {
      m.frustumCulled = false;
      m.count = 0;
      m.receiveShadow = true;
    }
    this.slabs.setColorAt(0, ICE_COLORS[0]);
    this.spikes.setColorAt(0, SPIKE_COLOR);
    this.group.add(this.slabs, this.spikes, this.fireLight, this.iceLight);
  }

  /**
   * @param flame llamarada de este fotograma (o null).
   * @param hero malla del protagonista (para el aura) y si el poder está activo.
   * @param sliding el protagonista se mueve sobre el hielo.
   */
  update(dt: number, fireIce: FireIce, maze: Maze, flame: Flame | null, hero: THREE.Object3D, powerOn: boolean, sliding: boolean): void {
    this.time += dt;
    this.heroZ = hero.position.z;
    this.drawIce(fireIce, maze);
    this.spray(dt, fireIce);
    this.drawFlame(dt, flame);
    if (powerOn) this.aura(dt, hero);
    if (sliding) this.slide(dt, hero);
  }

  /**
   * Bloques de hielo hasta la superficie de la rampa (sobre los muros los envuelven)
   * y cristales encima; cuajan en escalones y se derriten bajando.
   */
  private drawIce(fireIce: FireIce, maze: Maze): void {
    const { life } = CONFIG.specialPowers.fireIce.ice;
    let n = 0;
    let s = 0;
    for (const t of fireIce.ice.values()) {
      if (t.age < 0 || n >= MAX_ICE) continue;
      const tile = maze.tile(t.x, t.y);
      if (tile !== Tile.Open && tile !== Tile.Wall) continue;
      const appear = Math.ceil(Math.min(1, t.age / APPEAR) * 3) / 3;
      const left = life - t.age;
      // Parpadea justo antes de desaparecer.
      if (left < 0.4 && Math.floor(this.time * 14 + t.seed) % 2 === 0) continue;
      const onWall = tile === Tile.Wall;
      const h = (fireIce.surface(t.x, t.y, onWall) ?? 0) * appear;
      const size = (onWall ? 1.03 : 0.98) * (0.7 + 0.3 * appear);
      this.pos.set(worldX(t.x), t.y, h / 2 + 0.005);
      this.slabs.setMatrixAt(n, this.matrix.compose(this.pos, this.quat, this.scale.set(size, size, Math.max(0.001, h))));
      this.slabs.setColorAt(n, ICE_COLORS[t.seed % ICE_COLORS.length]);
      n++;
      // Cristales que asoman en algunas casillas.
      if (t.seed % 3 === 0) {
        const sh = (0.22 + (t.seed % 7) * 0.035) * appear;
        const ox = ((t.seed % 5) - 2) * 0.12;
        const oy = (((t.seed >> 3) % 5) - 2) * 0.12;
        this.pos.set(worldX(t.x) + ox, t.y + oy, h + sh / 2);
        this.spikes.setMatrixAt(s, this.matrix.compose(this.pos, this.spikeQuat, this.scale.set(0.13, 0.13, Math.max(0.001, sh))));
        this.spikes.setColorAt(s, SPIKE_COLOR);
        s++;
      }
    }
    this.slabs.count = n;
    this.spikes.count = s;
    this.slabs.instanceMatrix.needsUpdate = true;
    this.spikes.instanceMatrix.needsUpdate = true;
    if (this.slabs.instanceColor) this.slabs.instanceColor.needsUpdate = true;
    if (this.spikes.instanceColor) this.spikes.instanceColor.needsUpdate = true;
  }

  /** Rocío del disparo de hielo: partículas que salen de la boca abriéndose en cuña. */
  private spray(dt: number, fireIce: FireIce): void {
    const shot = fireIce.shot;
    const cfg = CONFIG.specialPowers.fireIce.ice;
    const travel = cfg.length / cfg.speed;
    if (!shot || shot.age > travel) {
      this.iceLight.intensity = Math.max(0, this.iceLight.intensity - dt * 20);
      return;
    }
    const dx = DX[shot.dir];
    const dy = DY[shot.dir];
    const spread = cfg.halfWidth[1] / cfg.length;
    const edge = Math.max(0, toEdge(shot.x, dx));
    this.acc.spray += dt * 260;
    for (; this.acc.spray >= 1; this.acc.spray--) {
      const v = cfg.speed * rand(0.75, 1.05);
      const life = Math.min(travel * rand(0.8, 1.2), edge / v);
      if (life <= 0.02) continue;
      const side = rand(-1, 1) * spread * v;
      const x = worldX(shot.x) + dx * 0.3;
      const y = shot.y + dy * 0.3;
      // Sube como la rampa.
      this.particles.emit(rand(0, 1) < 0.75 ? 'ice' : 'frost', x, y, this.heroZ - 0.3, dx * v - dy * side, dy * v + dx * side, rand(2, 5), rand(0.12, 0.22), life, { grow: 0.8 });
    }
    const k = Math.min(1, shot.age / travel);
    this.iceLight.position.set(worldX(shot.x) + dx * cfg.length * k * 0.6, shot.y + dy * cfg.length * k * 0.6, this.heroZ + 1);
    this.iceLight.intensity = 6;
  }

  /** Llamas de la llamarada: chorro de partículas que se abre y cambia de color, con luz naranja. */
  private drawFlame(dt: number, flame: Flame | null): void {
    if (!flame) {
      this.fireLight.intensity = Math.max(0, this.fireLight.intensity - dt * 25);
      return;
    }
    const cfg = CONFIG.specialPowers.fireIce.fire;
    const dx = DX[flame.dir];
    const dy = DY[flame.dir];
    const spread = (cfg.halfWidth[1] / cfg.length) * 0.9;
    const x0 = worldX(flame.x);
    this.acc.flame += dt * 400;
    for (; this.acc.flame >= 1; this.acc.flame--) {
      const v = cfg.speed * rand(0.55, 0.8);
      const side = rand(-1, 1) * spread * v;
      // Vive lo justo para llegar hasta donde ha llegado el frente (sin salir del laberinto).
      const life = Math.max(0.05, (Math.min(flame.reach, toEdge(flame.x, dx)) / v) * rand(0.85, 1.1));
      this.particles.emit('fire', x0, flame.y, this.heroZ + rand(-0.1, 0.1), dx * v - dy * side, dy * v + dx * side, rand(0, 1.5), rand(0.22, 0.34), life, { grow: 1.8 });
    }
    // Brasas que saltan de la punta.
    if (Math.random() < dt * 30) {
      const reach = Math.min(flame.reach, toEdge(flame.x, dx));
      const tx = x0 + dx * reach;
      const ty = flame.y + dy * reach;
      this.particles.emit('ember', tx, ty, this.heroZ, rand(-2, 2), rand(-2, 2), rand(2, 4), 0.09, rand(0.3, 0.5), { gravity: -8 });
    }
    const flicker = 0.8 + 0.2 * Math.sin(this.time * 47);
    this.fireLight.position.set(x0 + dx * flame.reach * 0.55, flame.y + dy * flame.reach * 0.55, this.heroZ + 0.15);
    this.fireLight.intensity = 11 * flicker;
  }

  /** Aura del poder: brasas que suben del lado en llamas y escarcha que cae del lado helado. */
  private aura(dt: number, hero: THREE.Object3D): void {
    const r = 0.35 * Math.abs(hero.scale.y);
    this.acc.aura += dt * 40;
    for (; this.acc.aura >= 1; this.acc.aura--) {
      const fire = Math.random() < 0.55;
      // Lado derecho del dibujo (el de la boca) en llamas; el izquierdo, helado.
      const a = rand(-Math.PI / 2, Math.PI / 2);
      const lx = (fire ? 1 : -1) * Math.cos(a) * r * rand(0.5, 1);
      const ly = Math.sin(a) * r;
      this.tmp.set(lx / Math.abs(hero.scale.y), ly / Math.abs(hero.scale.y), 0);
      this.tmp.multiply(hero.scale).applyQuaternion(hero.quaternion).add(hero.position);
      if (fire) this.particles.emit('fire', this.tmp.x, this.tmp.y, this.tmp.z + 0.1, rand(-0.3, 0.3), rand(0.6, 1.4), rand(1.5, 2.6), rand(0.08, 0.14), rand(0.25, 0.4), { grow: 0.6 });
      else this.particles.emit('frost', this.tmp.x, this.tmp.y, this.tmp.z, rand(-0.6, 0.6), rand(-0.6, 0.6), rand(-0.6, 0.2), rand(0.05, 0.09), rand(0.35, 0.6), { gravity: -1.5 });
    }
  }

  /** Destellos de hielo que salta al deslizarse. */
  private slide(dt: number, hero: THREE.Object3D): void {
    this.acc.slide += dt * 30;
    for (; this.acc.slide >= 1; this.acc.slide--) {
      const p = hero.position;
      this.particles.emit('frost', p.x + rand(-0.25, 0.25), p.y + rand(-0.25, 0.25), p.z - 0.4, rand(-1, 1), rand(-1, 1), rand(1, 2.5), rand(0.05, 0.08), rand(0.2, 0.35), { gravity: -9 });
    }
  }

  /** Bloques quemados: llamas y brasas que saltan de cada uno. */
  burnBurst(tiles: ReadonlyArray<{ x: number; y: number }>): void {
    const depth = CONFIG.maze.wallDepth;
    for (const t of tiles) {
      this.particles.burst('fire', worldX(t.x), t.y, depth * 0.6, 7, 2.5, 0.22, 0.45, { grow: 1.2, gravity: 3 });
      this.particles.burst('ember', worldX(t.x), t.y, depth * 0.8, 4, 3.5, 0.08, 0.6, { gravity: -9 });
    }
  }

  /** Fantasma muerto por el hielo (estalla en esquirlas) o por el fuego (arde). */
  ghostBurst(x: number, y: number, kind: 'ice' | 'fire'): void {
    if (kind === 'ice') this.particles.burst('ice', worldX(x), y, ACTOR_Z, 16, 4, 0.14, 0.5, { gravity: -10 });
    else this.particles.burst('fire', worldX(x), y, ACTOR_Z, 16, 3, 0.2, 0.5, { grow: 1.2, gravity: 3 });
  }

  /** Aterrizaje de la cinemática: anillo de fuego por un lado y de hielo por el otro. */
  landBurst(x: number, y: number, z: number): void {
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const fire = Math.cos(a) > 0;
      const v = rand(3, 5.5);
      this.particles.emit(fire ? 'fire' : 'ice', x, y, z, Math.cos(a) * v, Math.sin(a) * v, rand(0.5, 2), rand(0.16, 0.26), rand(0.35, 0.55), { drag: 3, grow: 0.8 });
    }
  }

  dispose(): void {
    this.box.dispose();
    this.slabMaterial.dispose();
    this.spikeMaterial.dispose();
    this.slabs.dispose();
    this.spikes.dispose();
    this.fireLight.dispose();
    this.iceLight.dispose();
  }
}
