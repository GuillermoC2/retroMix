import { CONFIG } from '../../config';
import { Emitter } from '../../core/Events';
import type { Chunk, Maze } from '../maze/Maze';

export const PelletType = { Dot: 1, Energizer: 2 } as const;
export type PelletType = (typeof PelletType)[keyof typeof PelletType];

export interface Pellet {
  x: number;
  y: number;
  type: PelletType;
  chunk: number;
  /** Índice dentro de su sección y tipo (lo usa la vista para instancias). */
  slot: number;
}

type PelletEvents = {
  chunkPopulated: { chunk: Chunk; pellets: Pellet[] };
  eaten: Pellet;
  chunkCleared: Chunk;
};

const key = (x: number, y: number) => y * 64 + x;

/** Puntos y energizadores: se reparten al crearse cada sección y se eliminan con ella. */
export class Pellets {
  readonly events = new Emitter<PelletEvents>();
  private byTile = new Map<number, Pellet>();
  private byChunk = new Map<number, Pellet[]>();
  private unsubscribe: Array<() => void>;

  constructor(private maze: Maze) {
    this.unsubscribe = [
      maze.events.on('chunkAdded', (c) => this.populate(c)),
      maze.events.on('chunkRemoved', (c) => this.clear(c)),
    ];
  }

  private populate(chunk: Chunk): void {
    const pellets: Pellet[] = [];
    const energizers = new Set(chunk.energizers.map((e) => key(e.x, e.y)));
    let dots = 0;
    let powers = 0;
    this.maze.forEachOpen(chunk.yStart, chunk.yEnd, (x, y) => {
      if (x === CONFIG.player.startColumn && y === CONFIG.player.startRow) return;
      const isPower = energizers.has(key(x, y));
      const p: Pellet = {
        x,
        y,
        type: isPower ? PelletType.Energizer : PelletType.Dot,
        chunk: chunk.index,
        slot: isPower ? powers++ : dots++,
      };
      pellets.push(p);
      this.byTile.set(key(x, y), p);
    });
    this.byChunk.set(chunk.index, pellets);
    this.events.emit('chunkPopulated', { chunk, pellets });
  }

  private clear(chunk: Chunk): void {
    for (const p of this.byChunk.get(chunk.index) ?? []) this.byTile.delete(key(p.x, p.y));
    this.byChunk.delete(chunk.index);
    this.events.emit('chunkCleared', chunk);
  }

  /** Come el punto de la casilla si existe y lo devuelve. */
  eatAt(x: number, y: number): Pellet | null {
    const p = this.byTile.get(key(x, y));
    if (!p) return null;
    this.byTile.delete(key(x, y));
    this.events.emit('eaten', p);
    return p;
  }

  dispose(): void {
    this.unsubscribe.forEach((u) => u());
    this.events.clear();
  }
}
