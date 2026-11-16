import type { Maze } from '../maze/Maze';
import type { DistanceField } from '../maze/DistanceField';
import { DIRS, DX, DY, isHorizontal, opposite, type Dir } from '../maze/grid';

/** `ally`: aliado del jugador (FANTASMA AMIGO): persigue a los demás, ni mata ni se puede comer. */
export type GhostState = 'spawning' | 'normal' | 'frightened' | 'eaten' | 'ally';

/** Información que necesita una personalidad para elegir objetivo. */
export interface GhostBrainContext {
  maze: Maze;
  player: { x: number; y: number; dir: Dir; tileX: number; tileY: number };
  /** Distancias reales hasta el jugador. */
  playerField: DistanceField;
  /** Fantasma perseguidor de referencia (para el flanqueador), si existe. */
  leader?: Ghost;
  scatter: boolean;
}

/** Objetivo: una casilla (se elige por distancia euclídea, como en el clásico) o perseguir por camino real. */
export type GhostTarget = { x: number; y: number } | 'pursue';

export interface GhostPersonality {
  id: string;
  color: number;
  target(ghost: Ghost, ctx: GhostBrainContext): GhostTarget;
}

/** Comportamientos. Añadir uno nuevo es añadir una entrada aquí. */
export const PERSONALITIES: readonly GhostPersonality[] = [
  {
    id: 'perseguidor',
    color: 0xff2e3a,
    target: (_g, ctx) => (ctx.scatter ? { x: ctx.maze.width - 2, y: ctx.player.tileY + 14 } : 'pursue'),
  },
  {
    id: 'emboscador',
    color: 0xff8fd8,
    target: (_g, ctx) => {
      if (ctx.scatter) return { x: 1, y: ctx.player.tileY + 14 };
      const { tileX, tileY, dir } = ctx.player;
      return { x: tileX + DX[dir] * 4, y: tileY + DY[dir] * 4 };
    },
  },
  {
    id: 'flanqueador',
    color: 0x3ae8ff,
    target: (_g, ctx) => {
      if (ctx.scatter) return { x: ctx.maze.width - 2, y: ctx.player.tileY + 2 };
      const { tileX, tileY, dir } = ctx.player;
      const px = tileX + DX[dir] * 2;
      const py = tileY + DY[dir] * 2;
      if (!ctx.leader) return 'pursue';
      return { x: px * 2 - ctx.leader.tileX, y: py * 2 - ctx.leader.tileY };
    },
  },
  {
    id: 'timido',
    color: 0xffa53a,
    target: (g, ctx) => {
      const far = ctx.playerField.get(g.tileX, g.tileY) > 8;
      return !ctx.scatter && far ? 'pursue' : { x: 1, y: ctx.player.tileY + 2 };
    },
  },
];

let nextId = 1;

/**
 * Un fantasma. Se mueve por los ejes de los pasillos y decide su dirección al
 * llegar al centro de cada casilla. Nunca da media vuelta salvo en un callejón
 * sin salida o al cambiar de modo (comportamiento clásico).
 */
export class Ghost {
  readonly id = nextId++;
  x: number;
  y: number;
  dir: Dir = 2;
  state: GhostState = 'spawning';
  stateTime = 0;
  /** Casilla a la que vuelven los ojos tras ser comido. */
  home: { x: number; y: number } | null = null;
  travelled = 0;

  constructor(
    readonly personality: GhostPersonality,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
  }

  get tileX(): number {
    return Math.round(this.x);
  }

  get tileY(): number {
    return Math.round(this.y);
  }

  setState(state: GhostState): void {
    if (state === this.state) return;
    const reverse = state === 'frightened' && this.state === 'normal';
    this.state = state;
    this.stateTime = 0;
    if (reverse) this.reverse();
  }

  reverse(): void {
    this.dir = opposite(this.dir);
  }

  /**
   * Avanza `distance` casillas. `choose` decide la dirección en cada centro
   * a partir de las salidas disponibles.
   */
  move(distance: number, maze: Maze, choose: (options: Dir[]) => Dir, blocked: (x: number, y: number) => boolean): void {
    let remaining = distance;
    let guard = 8;
    while (remaining > 1e-6 && guard-- > 0) {
      let horizontal = isHorizontal(this.dir);
      let sign = this.dir === 1 || this.dir === 0 ? 1 : -1;
      const along = (horizontal ? this.x : this.y) * sign;
      let toCenter = Math.ceil(along - 1e-6) - along;

      if (toCenter < 1e-6) {
        this.x = this.tileX;
        this.y = this.tileY;
        const open = (d: Dir) => maze.isOpen(this.tileX + DX[d], this.tileY + DY[d]);
        let options = DIRS.filter((d) => d !== opposite(this.dir) && open(d));
        const safe = options.filter((d) => !blocked(this.tileX + DX[d], this.tileY + DY[d]));
        if (safe.length) options = safe;
        if (!options.length) options = DIRS.filter(open);
        if (!options.length) return;
        this.dir = options.length === 1 ? options[0] : choose(options);
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
}
