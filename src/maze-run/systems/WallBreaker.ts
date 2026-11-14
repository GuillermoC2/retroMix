import { CONFIG } from '../../config';
import type { Maze } from '../maze/Maze';
import { DX, DY, Tile, type Dir } from '../maze/grid';

export type BreakFailure = 'no-charges' | 'cooldown' | 'no-wall' | 'border' | 'too-thick';

export type BreakResult =
  | { ok: true; tiles: Array<{ x: number; y: number }>; dir: Dir }
  | { ok: false; reason: BreakFailure; x: number; y: number };

/**
 * Poder "romper muro": abre un túnel recto a través del muro que hay delante,
 * hasta el pasillo del otro lado. Los muros miden al menos 2 casillas, así que
 * romper solo una dejaría un hueco ciego. El borde exterior es irrompible.
 */
export class WallBreaker {
  charges: number = CONFIG.powers.wallBreak.startCharges;
  /** Truco de desarrollo (menú de modo dios): romper sin gastar cargas. */
  infinite = false;
  private cooldown = 0;

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  /** Concede cargas (para futuras recompensas, p. ej. de un minijuego). */
  grant(amount: number): void {
    this.charges += amount;
  }

  /** Intenta romper desde la casilla (x, y) mirando en `dir`. Solo modifica el laberinto si tiene éxito. */
  tryBreak(maze: Maze, x: number, y: number, dir: Dir): BreakResult {
    const fx = x + DX[dir];
    const fy = y + DY[dir];
    if (!this.infinite && this.charges <= 0) return { ok: false, reason: 'no-charges', x: fx, y: fy };
    if (this.cooldown > 0) return { ok: false, reason: 'cooldown', x: fx, y: fy };

    const tiles: Array<{ x: number; y: number }> = [];
    const { maxDepth } = CONFIG.powers.wallBreak;
    for (let k = 1; ; k++) {
      const tx = x + DX[dir] * k;
      const ty = y + DY[dir] * k;
      const tile = maze.tile(tx, ty);
      if (tile === Tile.Open) break; // llegamos al pasillo del otro lado
      // Borde exterior o fuera del laberinto generado: irrompible.
      if (tile === undefined || tx <= 0 || tx >= maze.width - 1) return { ok: false, reason: 'border', x: fx, y: fy };
      if (k > maxDepth) return { ok: false, reason: 'too-thick', x: fx, y: fy };
      tiles.push({ x: tx, y: ty });
    }
    if (!tiles.length) return { ok: false, reason: 'no-wall', x: fx, y: fy };

    maze.setTiles(tiles, Tile.Open);
    if (!this.infinite) this.charges -= 1;
    this.cooldown = CONFIG.powers.wallBreak.cooldown;
    return { ok: true, tiles, dir };
  }
}
