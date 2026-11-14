import * as THREE from 'three';

/**
 * Convierte un sprite pixel art en una figura 2.5D de vóxeles.
 * Cada píxel del sprite se extruye en Z con una profundidad propia (perfil),
 * y solo se generan las caras visibles. El resultado es una única geometría
 * con colores por vértice, ideal para un material Lambert con sombreado plano.
 */

export interface VoxelSprite {
  width: number;
  height: number;
  /** Color (hex) del píxel (x, y) con y = 0 abajo, o null si está vacío. */
  color(x: number, y: number): number | null;
  /** Mitad de la profundidad del píxel, en vóxeles (0 = una sola capa). */
  halfDepth(x: number, y: number): number;
}

const FACES: Array<{ n: [number, number, number]; corners: Array<[number, number, number]> }> = [
  { n: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

export function buildVoxelGeometry(sprite: VoxelSprite, voxelSize: number): THREE.BufferGeometry {
  const { width, height } = sprite;
  const filled = (x: number, y: number, z: number): number | null => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const c = sprite.color(x, y);
    if (c === null) return null;
    return Math.abs(z) <= sprite.halfDepth(x, y) ? c : null;
  };

  let maxDepth = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) maxDepth = Math.max(maxDepth, sprite.halfDepth(x, y));

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();
  const ox = -width / 2;
  const oy = -height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let z = -maxDepth; z <= maxDepth; z++) {
        const c = filled(x, y, z);
        if (c === null) continue;
        color.setHex(c);
        for (const face of FACES) {
          const [nx, ny, nz] = face.n;
          if (filled(x + nx, y + ny, z + nz) !== null) continue;
          const base = positions.length / 3;
          for (const [cx, cy, cz] of face.corners) {
            positions.push((ox + x + cx) * voxelSize, (oy + y + cy) * voxelSize, (z - 0.5 + cz) * voxelSize);
            normals.push(nx, ny, nz);
            colors.push(color.r, color.g, color.b);
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/** Sprite a partir de filas de texto (fila 0 = arriba) y una paleta carácter → color. */
export function spriteFromRows(
  rows: readonly string[],
  palette: Record<string, number>,
  halfDepth: (x: number, y: number) => number,
): VoxelSprite {
  const height = rows.length;
  const width = rows[0].length;
  return {
    width,
    height,
    color: (x, y) => {
      const ch = rows[height - 1 - y][x];
      return ch in palette ? palette[ch] : null;
    },
    halfDepth,
  };
}
