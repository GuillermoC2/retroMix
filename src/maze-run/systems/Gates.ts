import { Emitter } from '../../core/Events';
import type { Rng } from '../../core/Rng';
import { MINIGAMES } from '../../minigames/registry';
import type { MinigameDef } from '../../minigames/types';
import type { Player } from '../entities/Player';
import type { Chunk, Maze } from '../maze/Maze';
import { Dir, Tile } from '../maze/grid';

export interface Gate {
  id: number;
  /** Primera y última fila de la barrera (va de lado a lado, sin el borde exterior). */
  y0: number;
  y1: number;
  chunk: number;
  /** Minijuego al que lleva (se elige al aparecer, para anunciarlo sobre el muro). */
  game: MinigameDef;
  /** La barrera sigue en pie (aún no se ha superado su minijuego). */
  closed: boolean;
}

type GateEvents = {
  added: Gate;
  removed: Gate;
  opened: Gate;
};

/**
 * Muros portal: barreras de lado a lado que aparecen con su sección y no dejan
 * pasar a nadie (sus casillas son `Tile.Gate`). Se entra en su minijuego al
 * empujarlas desde la línea de debajo; al superarlo, se abren.
 */
export class Gates {
  readonly events = new Emitter<GateEvents>();
  readonly list: Gate[] = [];
  private nextId = 0;
  private unsubscribe: Array<() => void>;

  constructor(
    private maze: Maze,
    private rng: Rng,
  ) {
    this.unsubscribe = [
      maze.events.on('chunkAdded', (c) => this.populate(c)),
      maze.events.on('chunkRemoved', (c) => this.clear(c)),
    ];
  }

  private populate(chunk: Chunk): void {
    for (const { y0, y1 } of chunk.gates) {
      const gate: Gate = { id: this.nextId++, y0, y1, chunk: chunk.index, game: this.rng.pick(MINIGAMES), closed: true };
      this.list.push(gate);
      this.events.emit('added', gate);
    }
  }

  private clear(chunk: Chunk): void {
    for (const g of this.list.filter((q) => q.chunk === chunk.index)) {
      this.list.splice(this.list.indexOf(g), 1);
      this.events.emit('removed', g);
    }
  }

  /**
   * Muro que el jugador está tocando: está en el centro de la línea justo debajo
   * y quiere ir (o va) hacia arriba.
   */
  touching(player: Player): Gate | null {
    const ty = player.tileY;
    if (Math.abs(player.y - ty) > 0.02) return null;
    if (player.wantDir !== Dir.Up && player.dir !== Dir.Up) return null;
    return this.list.find((g) => g.closed && ty === g.y0 - 1) ?? null;
  }

  /** Primer muro cerrado por encima de la fila `y`, si ya se ha generado. */
  nextClosedAbove(y: number): Gate | null {
    return this.list.filter((g) => g.closed && g.y0 > y).sort((a, b) => a.y0 - b.y0)[0] ?? null;
  }

  /** Casillas de la barrera. */
  tiles(gate: Gate): Array<{ x: number; y: number }> {
    const tiles: Array<{ x: number; y: number }> = [];
    for (let y = gate.y0; y <= gate.y1; y++) for (let x = 1; x < this.maze.width - 1; x++) tiles.push({ x, y });
    return tiles;
  }

  /** Abre el muro: sus casillas pasan a ser pasillo. */
  open(gate: Gate): void {
    if (!gate.closed) return;
    gate.closed = false;
    this.maze.setTiles(this.tiles(gate), Tile.Open);
    this.events.emit('opened', gate);
  }

  dispose(): void {
    this.unsubscribe.forEach((u) => u());
    this.events.clear();
  }
}

/** Fila central del muro (para colocar efectos y el cartel). */
export const gateCenterY = (g: Gate): number => (g.y0 + g.y1) / 2;
