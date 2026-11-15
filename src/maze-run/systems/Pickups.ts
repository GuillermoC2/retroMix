import { CONFIG } from '../../config';
import { Emitter } from '../../core/Events';
import type { Rng } from '../../core/Rng';
import type { Maze } from '../maze/Maze';
import { PelletType, type Pellets } from './Pellets';
import type { Portals } from './Portals';

/** Objetos que siembran algunas habilidades: cubito de hielo (HIELO), bola de energía (LASER), pluma (DASH) e imán (IMAN). */
export type PickupKind = 'ice' | 'laser' | 'dash' | 'magnet';

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
}

/** Cada cuánto y dónde aparece cada tipo (ver `CONFIG.abilities`). */
const SPAWN: Record<PickupKind, { every: number; band: number; firstAhead: number }> = {
  ice: CONFIG.abilities.ice,
  laser: CONFIG.abilities.laser,
  dash: CONFIG.abilities.dash,
  magnet: CONFIG.abilities.magnet,
};

type PickupEvents = {
  added: Pickup;
  /** Ha desaparecido (cogido o bajo la lava). */
  removed: Pickup;
};

/**
 * Objetos de habilidad repartidos por el laberinto. Mientras el jugador tiene
 * la habilidad, aparece uno de su tipo cada `every` metros en una casilla de
 * pasillo al azar de una franja de `band` filas (no en un energizador, junto a
 * un portal ni sobre otro objeto). Comparten casilla con el punto que haya.
 */
export class Pickups {
  readonly events = new Emitter<PickupEvents>();
  readonly list: Pickup[] = [];
  private nextId = 0;
  /** Fila desde la que se coloca el siguiente objeto de cada tipo activo. */
  private nextY = new Map<PickupKind, number>();

  constructor(
    private maze: Maze,
    private pellets: Pellets,
    private portals: Portals,
    private rng: Rng,
  ) {}

  enabled(kind: PickupKind): boolean {
    return this.nextY.has(kind);
  }

  /** Empieza a sembrar objetos de un tipo `firstAhead` filas por delante de `y` (si no lo estaba ya). */
  enable(kind: PickupKind, y: number): void {
    if (!this.enabled(kind)) this.nextY.set(kind, Math.round(y + SPAWN[kind].firstAhead));
  }

  /** Coloca los objetos de las filas ya generadas y quita los que han caído bajo la lava. */
  update(lavaY: number): void {
    for (const p of this.list.filter((q) => q.y < lavaY - 1)) this.remove(p);
    for (const [kind, from] of this.nextY) {
      const { every, band } = SPAWN[kind];
      // Tras un salto (modo dios) no se siembran las filas que ya quedan bajo la lava.
      let y = Math.max(from, Math.ceil(lavaY) + 4);
      while (y + band <= this.maze.topY) {
        const tile = this.pickTile(y, y + band - 1);
        if (tile) {
          const pickup = { id: this.nextId++, kind, ...tile };
          this.list.push(pickup);
          this.events.emit('added', pickup);
        }
        y += Math.round(every / CONFIG.scoring.metersPerRow);
      }
      this.nextY.set(kind, y);
    }
  }

  /** Coge el objeto de la casilla si lo hay. */
  takeAt(x: number, y: number): Pickup | null {
    const pickup = this.list.find((p) => p.x === x && p.y === y);
    if (pickup) this.remove(pickup);
    return pickup ?? null;
  }

  private pickTile(y0: number, y1: number): { x: number; y: number } | null {
    const tiles: Array<{ x: number; y: number }> = [];
    this.maze.forEachOpen(y0, y1, (x, y) => {
      if (this.pellets.typeAt(x, y) === PelletType.Energizer) return;
      if (this.portals.list.some((p) => Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1)) return;
      if (this.list.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) <= 2)) return;
      tiles.push({ x, y });
    });
    return tiles.length ? this.rng.pick(tiles) : null;
  }

  private remove(pickup: Pickup): void {
    const i = this.list.indexOf(pickup);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.events.emit('removed', pickup);
  }

  dispose(): void {
    this.events.clear();
  }
}
