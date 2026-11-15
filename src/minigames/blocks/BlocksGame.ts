import { CONFIG } from '../../config';
import type { MinigameKind } from '../types';

export type BlocksPhase = 'countdown' | 'play' | 'clear' | 'over';

/** Tipos de pieza (1–7; 0 = casilla vacía). */
export const PIECE_TYPES = 7;

/**
 * Formas de las 7 piezas de 4 bloques en su caja (fila 0 arriba). La caja gira
 * entera alrededor de su centro: 4×4 para la barra, 2×2 para el cuadrado y 3×3
 * para el resto.
 */
const SHAPES: readonly (readonly string[])[] = [
  ['....', '####', '....', '....'],
  ['##', '##'],
  ['.#.', '###', '...'],
  ['#..', '###', '...'],
  ['..#', '###', '...'],
  ['.##', '##.', '...'],
  ['##.', '.##', '...'],
];

/** Desplazamientos que se prueban al girar contra una pared o el suelo. */
const KICKS: ReadonlyArray<readonly [number, number]> = [[0, 0], [-1, 0], [1, 0], [0, 1], [-2, 0], [2, 0], [0, -1]];

export interface Cell {
  x: number;
  y: number;
}

export interface Piece {
  /** 1–7. */
  type: number;
  /** Celdas en coordenadas de su caja (Y hacia arriba). */
  cells: Cell[];
  /** Tamaño de la caja. */
  size: number;
  /** Esquina inferior izquierda de la caja en el pozo. */
  x: number;
  y: number;
}

/** Celdas de una forma con Y hacia arriba (fila 0 abajo). */
function shapeCells(type: number): { cells: Cell[]; size: number } {
  const rows = SHAPES[type - 1];
  const size = rows.length;
  const cells: Cell[] = [];
  rows.forEach((row, r) => [...row].forEach((ch, x) => ch === '#' && cells.push({ x, y: size - 1 - r })));
  return { cells, size };
}

/**
 * Lógica de BLOQUES, sin dibujo ni teclado: pozo de `width` × `height` con
 * Y hacia arriba (fila 0 abajo). Las piezas salen de una bolsa con las 7
 * mezcladas (así nunca hay rachas largas sin una forma). Se gana al completar
 * `linesToWin` líneas; se pierde si una pieza nueva no cabe al salir.
 */
export class BlocksGame {
  readonly cfg = CONFIG.minigames.blocks;
  readonly width = this.cfg.width;
  readonly height = this.cfg.height;
  readonly linesToWin: number;
  private readonly fall: { start: number; perLine: number; min: number };
  /** grid[y][x]: 0 vacío, 1–7 tipo de pieza fijada. */
  readonly grid: number[][];
  phase: BlocksPhase = 'countdown';
  phaseTime = 0;
  piece: Piece | null = null;
  next: number;
  lines = 0;
  won: boolean | null = null;
  /** Filas completas que se están borrando (durante `clear`). */
  clearing: number[] = [];

  // Contadores de eventos para la vista.
  locks = 0;
  moves = 0;
  rotations = 0;
  hardDrops = 0;
  /** Última pieza fijada (celdas en el pozo y si fue soltada de golpe). */
  lastLock: { cells: Cell[]; type: number; hard: boolean; dropped: number } | null = null;
  /** Líneas borradas de golpe la última vez (1–4). */
  lastClear = 0;
  clears = 0;

  private bag: number[] = [];
  private fallTimer = 0;
  private lockTimer = 0;
  private lockResets = 0;

  constructor(
    kind: MinigameKind,
    private random: () => number = Math.random,
  ) {
    this.linesToWin = this.cfg.linesToWin[kind];
    this.fall = this.cfg.fall[kind];
    this.grid = Array.from({ length: this.height }, () => new Array(this.width).fill(0));
    this.next = this.draw();
  }

  /** Segundos por fila con las líneas hechas hasta ahora. */
  get fallInterval(): number {
    return Math.max(this.fall.min, this.fall.start - this.fall.perLine * this.lines);
  }

  /** Celdas de la pieza actual en el pozo. */
  pieceCells(p: Piece | null = this.piece): Cell[] {
    return p ? p.cells.map((c) => ({ x: p.x + c.x, y: p.y + c.y })) : [];
  }

  /** Fila a la que caería la pieza actual (para la sombra). */
  dropY(): number {
    const p = this.piece!;
    let y = p.y;
    while (this.fits(p.cells, p.x, y - 1)) y--;
    return y;
  }

  private setPhase(phase: BlocksPhase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /**
   * @param input movimiento lateral pulsado ahora (-1/1, ya con la repetición
   * resuelta fuera), giro (-1 antihorario, 1 horario), bajada rápida y soltar.
   */
  update(dt: number, input: { move: number; rotate: number; soft: boolean; drop: boolean }): void {
    this.phaseTime += dt;
    switch (this.phase) {
      case 'countdown':
        if (this.phaseTime >= this.cfg.countdown) {
          this.setPhase('play');
          this.spawn();
        }
        return;
      case 'clear':
        if (this.phaseTime >= this.cfg.clearTime) this.finishClear();
        return;
      case 'over':
        return;
    }
    const p = this.piece;
    if (!p) return;

    if (input.rotate) this.rotate(input.rotate);
    if (input.move) this.shift(input.move);
    if (input.drop) {
      const from = p.y;
      p.y = this.dropY();
      this.hardDrops++;
      this.lock(true, from - p.y);
      return;
    }

    const grounded = !this.fits(p.cells, p.x, p.y - 1);
    if (grounded) {
      this.lockTimer += dt;
      if (this.lockTimer >= this.cfg.lockDelay) this.lock(false, 0);
      return;
    }
    this.lockTimer = 0;
    const interval = this.fallInterval * (input.soft ? this.cfg.softDropFactor : 1);
    this.fallTimer += dt;
    while (this.fallTimer >= interval && this.fits(p.cells, p.x, p.y - 1)) {
      this.fallTimer -= interval;
      p.y--;
    }
    if (!this.fits(p.cells, p.x, p.y - 1)) this.fallTimer = 0;
  }

  private shift(dx: number): void {
    const p = this.piece!;
    if (!this.fits(p.cells, p.x + dx, p.y)) return;
    p.x += dx;
    this.moves++;
    this.touched();
  }

  private rotate(dir: number): void {
    const p = this.piece!;
    const n = p.size;
    // Y hacia arriba: horario (x, y) → (y, n-1-x); antihorario (x, y) → (n-1-y, x).
    const cells = p.cells.map((c) => (dir > 0 ? { x: c.y, y: n - 1 - c.x } : { x: n - 1 - c.y, y: c.x }));
    for (const [kx, ky] of KICKS) {
      if (this.fits(cells, p.x + kx, p.y + ky)) {
        p.cells = cells;
        p.x += kx;
        p.y += ky;
        this.rotations++;
        this.touched();
        return;
      }
    }
  }

  /** Mover o girar estando apoyada da un poco más de tiempo antes de fijarse (unas cuantas veces). */
  private touched(): void {
    if (this.lockTimer > 0 && this.lockResets < this.cfg.lockResets) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  private fits(cells: readonly Cell[], x: number, y: number): boolean {
    return cells.every((c) => {
      const cx = x + c.x;
      const cy = y + c.y;
      if (cx < 0 || cx >= this.width || cy < 0) return false;
      return cy >= this.height || this.grid[cy][cx] === 0;
    });
  }

  private draw(): number {
    if (this.bag.length === 0) {
      this.bag = Array.from({ length: PIECE_TYPES }, (_, i) => i + 1);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop()!;
  }

  private spawn(): void {
    const type = this.next;
    this.next = this.draw();
    const { cells, size } = shapeCells(type);
    const top = Math.max(...cells.map((c) => c.y));
    const piece: Piece = { type, cells, size, x: Math.floor((this.width - size) / 2), y: this.height - 1 - top };
    this.fallTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    if (!this.fits(cells, piece.x, piece.y)) {
      // No cabe: el pozo está lleno.
      this.piece = null;
      this.won = false;
      this.setPhase('over');
      return;
    }
    this.piece = piece;
  }

  private lock(hard: boolean, dropped: number): void {
    const p = this.piece!;
    const cells = this.pieceCells(p);
    let above = false;
    for (const c of cells) {
      if (c.y >= this.height) above = true;
      else this.grid[c.y][c.x] = p.type;
    }
    this.piece = null;
    this.locks++;
    this.lastLock = { cells, type: p.type, hard, dropped };
    if (above) {
      // Se ha fijado asomando por encima del pozo.
      this.won = false;
      this.setPhase('over');
      return;
    }
    this.clearing = [];
    for (let y = 0; y < this.height; y++) if (this.grid[y].every((v) => v !== 0)) this.clearing.push(y);
    if (this.clearing.length > 0) {
      this.lastClear = this.clearing.length;
      this.clears++;
      this.setPhase('clear');
    } else {
      this.spawn();
    }
  }

  private finishClear(): void {
    for (const y of [...this.clearing].sort((a, b) => b - a)) {
      this.grid.splice(y, 1);
      this.grid.push(new Array(this.width).fill(0));
    }
    this.lines += this.clearing.length;
    this.clearing = [];
    if (this.lines >= this.linesToWin) {
      this.won = true;
      this.setPhase('over');
      return;
    }
    this.setPhase('play');
    this.spawn();
  }

  /** Forma de una pieza (para la vista previa de la siguiente). */
  static shape(type: number): { cells: Cell[]; size: number } {
    return shapeCells(type);
  }
}
