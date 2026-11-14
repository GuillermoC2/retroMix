import { CONFIG } from '../../config';
import type { Maze } from '../maze/Maze';
import { DX, DY, isHorizontal, opposite, type Dir } from '../maze/grid';

export type Passable = (x: number, y: number) => boolean;

/**
 * Lógica del protagonista: movimiento continuo sobre los ejes de los pasillos.
 * Coordenadas en casillas: un valor entero es el centro de una casilla.
 *
 * - La dirección deseada queda "en búfer" y se aplica en cuanto es posible.
 * - Invertir el sentido es instantáneo.
 * - Se puede girar ligeramente antes o después del centro (cornerTolerance),
 *   lo que hace el control ágil sin atravesar nunca paredes.
 */
export class Player {
  x: number;
  y: number;
  dir: Dir = 0;
  wantDir: Dir | null = null;
  moving = false;
  alive = true;
  /** Distancia recorrida (para animar la boca). */
  travelled = 0;
  speedMultiplier = 1;
  private passable: Passable = () => false;

  constructor(x = CONFIG.player.startColumn, y = CONFIG.player.startRow) {
    this.x = x;
    this.y = y;
  }

  get tileX(): number {
    return Math.round(this.x);
  }

  get tileY(): number {
    return Math.round(this.y);
  }

  /**
   * @param passable casillas por las que puede pasar. Por defecto, las abiertas;
   *   un poder (p. ej. el gigante) puede permitir entrar en muros.
   */
  update(dt: number, maze: Maze, passable: Passable = (x, y) => maze.isOpen(x, y)): void {
    if (!this.alive) return;
    this.passable = passable;
    let remaining = CONFIG.player.speed * this.speedMultiplier * dt;

    if (this.wantDir !== null && this.moving && this.wantDir === opposite(this.dir)) this.dir = this.wantDir;
    this.tryCornerTurn();

    let guard = 8;
    while (remaining > 1e-6 && guard-- > 0) {
      let horizontal = isHorizontal(this.dir);
      let sign = this.dir === 1 || this.dir === 0 ? 1 : -1;
      const along = (horizontal ? this.x : this.y) * sign;
      let toCenter = Math.ceil(along - 1e-6) - along;

      if (toCenter < 1e-6) {
        // En el centro de una casilla: decidir giro o parada.
        this.x = this.tileX;
        this.y = this.tileY;
        if (this.wantDir !== null && this.canEnter(this.wantDir)) this.dir = this.wantDir;
        if (!this.canEnter(this.dir)) {
          this.moving = false;
          return;
        }
        this.moving = true;
        horizontal = isHorizontal(this.dir);
        sign = this.dir === 1 || this.dir === 0 ? 1 : -1;
        toCenter = 1;
      }

      const step = Math.min(toCenter, remaining);
      if (horizontal) this.x += step * sign;
      else this.y += step * sign;
      remaining -= step;
      this.travelled += step;
    }
  }

  /** Giro perpendicular cerca del centro de la casilla: recoloca al centro y gira. */
  private tryCornerTurn(): void {
    const want = this.wantDir;
    if (want === null || want === this.dir || want === opposite(this.dir)) return;
    const offset = isHorizontal(this.dir) ? Math.abs(this.x - this.tileX) : Math.abs(this.y - this.tileY);
    if (offset > CONFIG.player.cornerTolerance) return;
    if (!this.passable(this.tileX + DX[want], this.tileY + DY[want])) return;
    this.x = this.tileX;
    this.y = this.tileY;
    this.dir = want;
    this.moving = true;
  }

  private canEnter(d: Dir): boolean {
    return this.passable(this.tileX + DX[d], this.tileY + DY[d]);
  }
}
