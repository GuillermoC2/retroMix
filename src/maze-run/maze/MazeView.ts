import * as THREE from 'three';
import { CONFIG } from '../../config';
import { NeonCycle } from '../../render/neon';
import { PixelCanvas, hexRGB } from '../../render/pixelTextures';
import { worldX } from '../world';
import type { Chunk, Maze } from './Maze';
import { Tile } from './grid';

/** Píxeles de textura por casilla y separación del contorno respecto al borde. */
const T = 8;
const INSET = 2;
/** Tamaño (casillas) de cada celda de la rejilla de fondo. */
const BACKDROP_CELL = 3;

/**
 * Las texturas son máscaras en escala de grises: el color real lo pone el
 * degradado neón (blanco = neón pleno, gris oscuro = relleno tenue del mismo tono).
 */
const PALETTE = {
  fillA: hexRGB(0x1c1c1c),
  fillB: hexRGB(0x262626),
  /** Tubo de neón: línea plena y un halo tenue a cada lado. */
  line: hexRGB(0xffffff),
  halo: hexRGB(0x5c5c5c),
  /** Caras laterales de abajo (suelo) a arriba (tapa): resplandor en la base, cuerpo oscuro y canto brillante. */
  side: [0x8a8a8a, 0x3c3c3c, 0x202020, 0x242424, 0x2a2a2a, 0x323232, 0x4a4a4a, 0xffffff].map(hexRGB),
  sideRib: hexRGB(0x161616),
  floorA: hexRGB(0x0c0c0c),
  floorB: hexRGB(0x2a2a2a),
  backdropA: hexRGB(0x000000),
  backdropB: hexRGB(0x1c1c1c),
};

/**
 * Representación 3D del laberinto por secciones:
 *  - una "tapa" frontal con textura pixel art (relleno + contorno estilo arcade
 *    generado automáticamente según las casillas vecinas),
 *  - caras laterales extruidas en Z con sombreado,
 *  - un suelo compartido que sigue a la cámara.
 * Una sección se construye cuando existe la fila superior siguiente (para
 * conocer a sus vecinos) y se destruye cuando el laberinto la elimina.
 */
export class MazeView {
  readonly group = new THREE.Group();
  private built = new Map<number, THREE.Group>();
  private pending: Chunk[] = [];
  private sideMaterial: THREE.MeshLambertMaterial;
  private floor: THREE.Mesh;
  private backdrop: THREE.Mesh;
  /** Degradado neón de los muros (público para que los efectos usen el mismo color). */
  readonly neon: NeonCycle;
  private unsubscribe: Array<() => void>;

  constructor(private maze: Maze) {
    const { colors, secondsPerColor, transition } = CONFIG.maze.neon;
    this.neon = new NeonCycle(colors, secondsPerColor, transition);
    const sideTex = this.sideTexture();
    this.sideMaterial = this.neon.apply(
      new THREE.MeshLambertMaterial({ map: sideTex, emissive: 0xffffff, emissiveMap: sideTex, emissiveIntensity: 0.22 }),
    );
    this.floor = this.createFloor();
    this.backdrop = this.createBackdrop();
    this.group.add(this.floor, this.backdrop);
    this.unsubscribe = [
      maze.events.on('chunkAdded', (c) => {
        this.pending.push(c);
        this.flushPending();
      }),
      maze.events.on('chunkRemoved', (c) => this.destroy(c.index)),
      maze.events.on('chunkChanged', (c) => {
        if (!this.built.has(c.index)) return;
        this.destroy(c.index);
        this.build(c);
      }),
    ];
  }

  /** Anima el degradado y mueve el suelo con la cámara (en pasos enteros para que la textura no "nade"). */
  update(dt: number, focusY: number): void {
    this.neon.update(dt);
    this.floor.position.y = Math.round(focusY);
    this.backdrop.position.y = Math.round(focusY / BACKDROP_CELL) * BACKDROP_CELL;
  }

  private flushPending(): void {
    this.pending = this.pending.filter((c) => {
      if (!this.maze.hasRow(c.yEnd + 1)) return true;
      this.build(c);
      return false;
    });
  }

  private isWall(x: number, y: number): boolean {
    return this.maze.tile(x, y) === Tile.Wall;
  }

  private build(chunk: Chunk): void {
    const group = new THREE.Group();
    group.add(this.buildCap(chunk), this.buildSides(chunk));
    this.built.set(chunk.index, group);
    this.group.add(group);
  }

  private destroy(index: number): void {
    const group = this.built.get(index);
    if (!group) return;
    this.built.delete(index);
    this.group.remove(group);
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (o.material !== this.sideMaterial) {
          (o.material as THREE.MeshLambertMaterial).map?.dispose();
          (o.material as THREE.Material).dispose();
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Tapa frontal
  // ---------------------------------------------------------------------------

  private buildCap(chunk: Chunk): THREE.Mesh {
    const W = this.maze.width;
    const rows = chunk.yEnd - chunk.yStart + 1;
    const canvas = new PixelCanvas(W * T, rows * T);

    for (let y = chunk.yStart; y <= chunk.yEnd; y++) {
      for (let x = 0; x < W; x++) {
        if (this.isWall(x, y)) this.drawWallTile(canvas, x, y, x * T, (chunk.yEnd - y) * T);
      }
    }

    const tex = canvas.toTexture();
    const material = this.neon.apply(
      new THREE.MeshLambertMaterial({
        map: tex,
        alphaTest: 0.5,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.85,
      }),
    );
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, rows), material);
    mesh.position.set(0, (chunk.yStart + chunk.yEnd) / 2, CONFIG.maze.wallDepth);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Dibuja una casilla de pared: relleno con trama y contorno en los lados que dan a pasillo o vacío. */
  private drawWallTile(c: PixelCanvas, x: number, y: number, px: number, py: number): void {
    const wall = (dx: number, dy: number) => this.isWall(x + dx, y + dy);
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) c.set(px + i, py + j, (i + j) % 4 === 0 ? PALETTE.fillB : PALETTE.fillA);

    const up = !wall(0, 1);
    const down = !wall(0, -1);
    const left = !wall(-1, 0);
    const right = !wall(1, 0);

    /** Traza el contorno a `inset` píxeles del borde de la pieza. */
    const outline = (inset: number, color: (typeof PALETTE)['line']) => {
      const far = T - 1 - inset;
      const dot = (i: number, j: number) => c.set(px + i, py + j, color);

      // Lados rectos; las esquinas convexas se recortan para que queden redondeadas.
      const i0 = left ? inset + 1 : 0;
      const i1 = right ? far - 1 : T - 1;
      const j0 = up ? inset + 1 : 0;
      const j1 = down ? far - 1 : T - 1;
      if (up) for (let i = i0; i <= i1; i++) dot(i, inset);
      if (down) for (let i = i0; i <= i1; i++) dot(i, far);
      if (left) for (let j = j0; j <= j1; j++) dot(inset, j);
      if (right) for (let j = j0; j <= j1; j++) dot(far, j);

      // Esquinas cóncavas (pared en ambos lados, hueco en diagonal).
      for (let k = 0; k < inset; k++) {
        if (!up && !left && !wall(-1, 1)) dot(inset, k), dot(k, inset);
        if (!up && !right && !wall(1, 1)) dot(far, k), dot(T - 1 - k, inset);
        if (!down && !left && !wall(-1, -1)) dot(inset, T - 1 - k), dot(k, far);
        if (!down && !right && !wall(1, -1)) dot(far, T - 1 - k), dot(T - 1 - k, far);
      }
    };

    // Halo a ambos lados y, encima, la línea plena: efecto de tubo de neón.
    outline(INSET - 1, PALETTE.halo);
    outline(INSET + 1, PALETTE.halo);
    outline(INSET, PALETTE.line);
  }

  // ---------------------------------------------------------------------------
  // Caras laterales
  // ---------------------------------------------------------------------------

  private buildSides(chunk: Chunk): THREE.Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const D = CONFIG.maze.wallDepth;

    const quad = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => {
      const base = positions.length / 3;
      positions.push(ax, ay, 0, bx, by, 0, bx, by, D, ax, ay, D);
      for (let k = 0; k < 4; k++) normals.push(nx, ny, 0);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    for (let y = chunk.yStart; y <= chunk.yEnd; y++) {
      for (let x = 0; x < this.maze.width; x++) {
        if (!this.isWall(x, y)) continue;
        const l = worldX(x) - 0.5;
        const r = worldX(x) + 0.5;
        const b = y - 0.5;
        const t = y + 0.5;
        // Vértices ordenados para que la normal apunte hacia fuera.
        if (!this.isWall(x, y + 1)) quad(r, t, l, t, 0, 1);
        if (!this.isWall(x, y - 1)) quad(l, b, r, b, 0, -1);
        if (!this.isWall(x - 1, y)) quad(l, t, l, b, -1, 0);
        if (!this.isWall(x + 1, y)) quad(r, b, r, t, 1, 0);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, this.sideMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private sideTexture(): THREE.DataTexture {
    const c = new PixelCanvas(8, 8);
    for (let j = 0; j < 8; j++) {
      const shade = PALETTE.side[7 - j];
      // Una costilla vertical por casilla da aspecto de paneles sin ensuciar el canto ni la base.
      for (let i = 0; i < 8; i++) c.set(i, j, i === 0 && j > 1 && j < 6 ? PALETTE.sideRib : shade);
    }
    return c.toTexture();
  }

  private createFloor(): THREE.Mesh {
    const c = new PixelCanvas(8, 8);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) c.set(i, j, (i === 0 || j === 0) && (i + j) % 2 === 0 ? PALETTE.floorB : PALETTE.floorA);
    const tex = c.toTexture(true);
    const W = this.maze.width;
    const H = 90;
    tex.repeat.set(W, H);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.neon.apply(new THREE.MeshLambertMaterial({ map: tex })));
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Rejilla tenue del color del laberinto que llena el vacío a los lados y da sensación de ascenso. */
  private createBackdrop(): THREE.Mesh {
    const n = 12;
    const c = new PixelCanvas(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) c.set(i, j, i === 0 || j === 0 ? PALETTE.backdropB : PALETTE.backdropA);
    const tex = c.toTexture(true);
    const size = BACKDROP_CELL * 40;
    tex.repeat.set(size / BACKDROP_CELL, size / BACKDROP_CELL);
    const material = this.neon.apply(new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3 }));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    // Desfase de media casilla para que las líneas no coincidan con el borde del laberinto.
    mesh.position.set(0.5, 0, -2.5);
    return mesh;
  }

  dispose(): void {
    this.unsubscribe.forEach((u) => u());
    [...this.built.keys()].forEach((i) => this.destroy(i));
    this.sideMaterial.map?.dispose();
    this.sideMaterial.dispose();
    this.floor.geometry.dispose();
    const fm = this.floor.material as THREE.MeshLambertMaterial;
    fm.map?.dispose();
    fm.dispose();
    this.backdrop.geometry.dispose();
    const bm = this.backdrop.material as THREE.MeshLambertMaterial;
    bm.map?.dispose();
    bm.dispose();
  }
}
