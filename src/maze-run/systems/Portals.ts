import { CONFIG } from '../../config';
import { Emitter } from '../../core/Events';
import type { Rng } from '../../core/Rng';
import { MINIGAMES } from '../../minigames/registry';
import type { MinigameDef } from '../../minigames/types';
import type { Chunk, Maze } from '../maze/Maze';

export interface Portal {
  id: number;
  x: number;
  y: number;
  chunk: number;
  /** Minijuego al que lleva (se elige al aparecer, para poder anunciarlo). */
  game: MinigameDef;
  /** Abierto, o cerrado tras usarlo. */
  open: boolean;
}

type PortalEvents = {
  added: Portal;
  removed: Portal;
  closed: Portal;
};

/**
 * Portales a minijuegos: aparecen con las secciones que traen sala de portal y
 * desaparecen con ellas. Se entra pisando su centro; tras usarlo se cierra.
 */
export class Portals {
  readonly events = new Emitter<PortalEvents>();
  readonly list: Portal[] = [];
  private nextId = 0;
  private unsubscribe: Array<() => void>;

  constructor(maze: Maze, private rng: Rng) {
    this.unsubscribe = [
      maze.events.on('chunkAdded', (c) => this.populate(c)),
      maze.events.on('chunkRemoved', (c) => this.clear(c)),
    ];
  }

  private populate(chunk: Chunk): void {
    for (const { x, y } of chunk.portals) {
      const portal: Portal = { id: this.nextId++, x, y, chunk: chunk.index, game: this.rng.pick(MINIGAMES), open: true };
      this.list.push(portal);
      this.events.emit('added', portal);
    }
  }

  private clear(chunk: Chunk): void {
    for (const p of this.list.filter((q) => q.chunk === chunk.index)) {
      this.list.splice(this.list.indexOf(p), 1);
      this.events.emit('removed', p);
    }
  }

  /** Portal abierto en cuyo centro está el jugador, si lo hay. */
  touching(x: number, y: number): Portal | null {
    const r2 = CONFIG.portals.enterRadius ** 2;
    return this.list.find((p) => p.open && (p.x - x) ** 2 + (p.y - y) ** 2 <= r2) ?? null;
  }

  close(portal: Portal): void {
    if (!portal.open) return;
    portal.open = false;
    this.events.emit('closed', portal);
  }

  dispose(): void {
    this.unsubscribe.forEach((u) => u());
    this.events.clear();
  }
}
