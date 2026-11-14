import * as THREE from 'three';
import { CONFIG } from '../../config';
import { DX, DY, type Dir } from '../maze/grid';
import { worldX } from '../world';

const MAX_PIECES = 800;
/** Fragmentos por casilla rota: rejilla 3×3 en el frente × 3 capas de profundidad. */
const GRID = 3;
const LAYERS = 3;
const GRAVITY = 16;
const DRAG = 1.6;

interface Piece {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  size: number;
  age: number;
  life: number;
}

/**
 * Animación de muro roto: el bloque estalla en pedazos voxel del color neón del
 * muro, que salen despedidos hacia la cámara y en la dirección del golpe, caen,
 * giran y se encogen. Incluye un destello de luz breve.
 */
export class ShatterEffect {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private pieces: Piece[] = [];
  private next = 0;
  private flash: THREE.PointLight;
  private flashTime = 0;
  private matrix = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX_PIECES);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    for (let i = 0; i < MAX_PIECES; i++) {
      this.mesh.setMatrixAt(i, this.hidden);
      this.mesh.setColorAt(i, this.color.set(0xffffff));
      this.pieces.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        size: 0,
        age: 0,
        life: 1,
      });
    }
    this.flash = new THREE.PointLight(0xffffff, 0, 7, 1.5);
    this.group.add(this.mesh, this.flash);
  }

  /**
   * @param neon color neón actual del laberinto.
   * @param coarse pedazos más grandes y menos numerosos (2×2×2 por casilla), para
   *   cuando se rompen muchas casillas seguidas (poder GIGANTE).
   */
  burst(tiles: ReadonlyArray<{ x: number; y: number }>, dir: Dir, neon: THREE.Color, coarse = false): void {
    const depth = CONFIG.maze.wallDepth;
    const grid = coarse ? 2 : GRID;
    const layers = coarse ? 2 : LAYERS;
    const cell = 1 / grid;
    for (const t of tiles) {
      for (let gy = 0; gy < grid; gy++) {
        for (let gx = 0; gx < grid; gx++) {
          for (let gz = 0; gz < layers; gz++) {
            const lx = (gx - (grid - 1) / 2) * cell;
            const ly = (gy - (grid - 1) / 2) * cell;
            const front = gz === layers - 1;
            const edge = coarse || gx === 0 || gy === 0 || gx === grid - 1 || gy === grid - 1;
            // Los pedazos del frente y del contorno brillan con el neón; el interior es relleno oscuro.
            const brightness = front && edge ? 1 : front ? 0.35 : 0.2;
            this.spawn(
              worldX(t.x) + lx + rand(-0.04, 0.04),
              t.y + ly + rand(-0.04, 0.04),
              ((gz + 0.5) / layers) * depth,
              lx * rand(3, 6) + DX[dir] * rand(1, 3),
              ly * rand(3, 6) + DY[dir] * rand(1, 3) + rand(1, 3.5),
              rand(2, 5.5) * (0.5 + gz / layers),
              cell * rand(0.6, 0.95),
              this.color.copy(neon).multiplyScalar(brightness),
            );
          }
        }
      }
    }
    const mid = tiles[Math.floor(tiles.length / 2)];
    this.flash.position.set(worldX(mid.x), mid.y, depth + 0.8);
    this.flash.color.copy(neon);
    this.flashTime = 0.3;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, color: THREE.Color): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_PIECES;
    const p = this.pieces[i];
    p.alive = true;
    p.pos.set(x, y, z);
    p.vel.set(vx, vy, vz);
    p.rot.set(0, 0, 0);
    p.spin.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));
    p.size = size;
    p.age = 0;
    p.life = rand(0.55, 1.0);
    this.mesh.setColorAt(i, color);
  }

  update(dt: number): void {
    this.flashTime = Math.max(0, this.flashTime - dt);
    this.flash.intensity = (this.flashTime / 0.3) * 40;

    let dirty = false;
    for (let i = 0; i < MAX_PIECES; i++) {
      const p = this.pieces[i];
      if (!p.alive) continue;
      dirty = true;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        this.mesh.setMatrixAt(i, this.hidden);
        continue;
      }
      const drag = Math.exp(-DRAG * dt);
      p.vel.multiplyScalar(drag);
      p.vel.y -= GRAVITY * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      // Se encogen en la última parte de su vida (en escalones, más pixel art).
      const k = 1 - Math.max(0, (p.age / p.life - 0.55) / 0.45);
      const s = p.size * Math.ceil(k * 4) / 4;
      this.mesh.setMatrixAt(i, this.matrix.compose(p.pos, this.quat.setFromEuler(p.rot), this.scale.set(s, s, s)));
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    this.flash.dispose();
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
