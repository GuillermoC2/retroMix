import type { Maze } from './Maze';
import { DX, DY } from './grid';

/**
 * Distancias en pasos (BFS) desde una casilla origen a todas las casillas
 * abiertas dentro de una ventana de filas. Permite a los fantasmas perseguir
 * por el camino real en un laberinto procedural, sin quedarse atascados.
 */
export class DistanceField {
  private dist = new Int32Array(0);
  private minY = 0;
  private maxY = -1;
  private width = 0;
  sourceX = NaN;
  sourceY = NaN;

  compute(maze: Maze, sx: number, sy: number, minY: number, maxY: number): void {
    this.sourceX = sx;
    this.sourceY = sy;
    this.minY = minY;
    this.maxY = maxY;
    this.width = maze.width;
    const size = (maxY - minY + 1) * this.width;
    if (this.dist.length < size) this.dist = new Int32Array(size);
    this.dist.fill(-1, 0, size);
    if (!maze.isOpen(sx, sy) || sy < minY || sy > maxY) return;

    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;
    const start = (sy - minY) * this.width + sx;
    this.dist[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const idx = queue[head++];
      const x = idx % this.width;
      const y = (idx - x) / this.width + minY;
      const d = this.dist[idx] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k];
        const ny = y + DY[k];
        if (ny < minY || ny > maxY || !maze.isOpen(nx, ny)) continue;
        const nIdx = (ny - minY) * this.width + nx;
        if (this.dist[nIdx] !== -1) continue;
        this.dist[nIdx] = d;
        queue[tail++] = nIdx;
      }
    }
  }

  /** Distancia en pasos, o Infinity si no es alcanzable o está fuera de la ventana. */
  get(x: number, y: number): number {
    if (y < this.minY || y > this.maxY || x < 0 || x >= this.width) return Infinity;
    const d = this.dist[(y - this.minY) * this.width + x];
    return d < 0 ? Infinity : d;
  }
}
