import { Emitter } from '../../core/Events';
import { Rng } from '../../core/Rng';
import { MazeGenerator } from './MazeGenerator';
import { Tile } from './grid';

export interface Chunk {
  index: number;
  yStart: number;
  /** Última fila (inclusive). */
  yEnd: number;
  style: string;
  energizers: ReadonlyArray<{ x: number; y: number }>;
  /** Portales a minijuegos (centro de su sala). */
  portals: ReadonlyArray<{ x: number; y: number }>;
}

type MazeEvents = {
  chunkAdded: Chunk;
  chunkRemoved: Chunk;
  /** Una casilla de la sección ha cambiado (p. ej. por un efecto futuro). */
  chunkChanged: Chunk;
};

/**
 * Datos del laberinto activo: las filas generadas, organizadas por secciones que
 * se crean por arriba y se destruyen por abajo. Es la única fuente de verdad
 * para colisiones; las vistas y sistemas escuchan sus eventos.
 */
export class Maze {
  readonly events = new Emitter<MazeEvents>();
  readonly chunks: Chunk[] = [];
  private rows = new Map<number, Uint8Array>();
  private generator: MazeGenerator;
  /** Fila más alta generada. */
  topY = -1;

  constructor(rng: Rng) {
    this.generator = new MazeGenerator(rng);
  }

  get width(): number {
    return this.generator.width;
  }

  /** Casilla en (x, y), o `undefined` si esa fila no existe (no generada o destruida). */
  tile(x: number, y: number): Tile | undefined {
    const row = this.rows.get(y);
    if (!row || x < 0 || x >= row.length) return undefined;
    return row[x] as Tile;
  }

  isOpen(x: number, y: number): boolean {
    return this.tile(x, y) === Tile.Open;
  }

  hasRow(y: number): boolean {
    return this.rows.has(y);
  }

  ensureGenerated(upToY: number): void {
    while (this.topY < upToY) {
      const data = this.generator.nextChunkData();
      data.rows.forEach((row, k) => this.rows.set(data.yStart + k, row));
      const chunk: Chunk = {
        index: data.index,
        yStart: data.yStart,
        yEnd: data.yStart + data.rows.length - 1,
        style: data.style,
        energizers: data.energizers,
        portals: data.portals,
      };
      this.topY = chunk.yEnd;
      this.chunks.push(chunk);
      this.events.emit('chunkAdded', chunk);
    }
  }

  /** Destruye las secciones que quedan completamente por debajo de `y`. */
  destroyBelow(y: number): void {
    while (this.chunks.length > 1 && this.chunks[0].yEnd < y) {
      const chunk = this.chunks.shift()!;
      for (let row = chunk.yStart; row <= chunk.yEnd; row++) this.rows.delete(row);
      this.events.emit('chunkRemoved', chunk);
    }
  }

  chunkAt(y: number): Chunk | undefined {
    return this.chunks.find((c) => y >= c.yStart && y <= c.yEnd);
  }

  /** Modifica una casilla. */
  setTile(x: number, y: number, tile: Tile): void {
    this.setTiles([{ x, y }], tile);
  }

  /**
   * Modifica varias casillas y avisa una sola vez a cada sección afectada,
   * incluidas las vecinas por arriba/abajo (su dibujo depende de las casillas
   * del otro lado de la frontera).
   */
  setTiles(tiles: ReadonlyArray<{ x: number; y: number }>, tile: Tile): void {
    const touched = new Set<Chunk>();
    for (const { x, y } of tiles) {
      const row = this.rows.get(y);
      if (!row || x < 0 || x >= row.length || row[x] === tile) continue;
      row[x] = tile;
      for (const ny of [y - 1, y, y + 1]) {
        const chunk = this.chunkAt(ny);
        if (chunk) touched.add(chunk);
      }
    }
    touched.forEach((chunk) => this.events.emit('chunkChanged', chunk));
  }

  /** Recorre las casillas abiertas en un rango de filas. */
  forEachOpen(yFrom: number, yTo: number, fn: (x: number, y: number) => void): void {
    for (let y = yFrom; y <= yTo; y++) {
      const row = this.rows.get(y);
      if (!row) continue;
      for (let x = 0; x < row.length; x++) if (row[x] === Tile.Open) fn(x, y);
    }
  }
}
